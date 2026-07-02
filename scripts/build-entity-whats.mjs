#!/usr/bin/env node
// scripts/build-entity-whats.mjs
// Precompute generator: fetches Wikipedia summaries + paraphrases via Haiku,
// then writes/merges app/data/entity-whats.json.
// Run: ANTHROPIC_API_KEY=... node scripts/build-entity-whats.mjs
// Called by R17 (.github/workflows/refresh-weekend-data.yml) weekly.
// Pure assembly logic lives in app/lib/entity-builder.ts (TypeScript, tested by vitest).
// This script duplicates the three tiny pure helpers below to avoid a TS compile step.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA = resolve(ROOT, "app", "data");

const TITLES_PATH = resolve(DATA, "entity-titles.json");
const DRIVERS_PATH = resolve(DATA, "drivers.json");
const TEAMS_PATH = resolve(DATA, "teams.json");
const WHATS_PATH = resolve(DATA, "entity-whats.json");

// ---------------------------------------------------------------------------
// Guard: require API key before doing anything
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error(
    "ERROR: ANTHROPIC_API_KEY is not set.\n" +
    "Run: ANTHROPIC_API_KEY=<key> node scripts/build-entity-whats.mjs"
  );
  process.exit(1);
}

const HAIKU = "claude-haiku-4-5-20251001";
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Be polite to the Wikipedia REST API: a small gap between entities + retry on
// rate-limit (429) / transient (503) with exponential backoff. Firing ~60 requests
// back-to-back gets the runner IP rate-limited partway through.
const THROTTLE_MS = 300;
const MAX_RETRIES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Pure helpers (duplicated from app/lib/entity-merge.ts + app/lib/paraphrase.ts)
// Source of truth for these functions is in those TypeScript files; keep in sync.
// ---------------------------------------------------------------------------

/** @param {string} summary */
function contentHash(summary) {
  return createHash("sha256").update(summary.trim()).digest("hex").slice(0, 16);
}

/**
 * @param {object|undefined} prev  Prior EntityWhat (or undefined for new)
 * @param {object}           next  Built record (type, slug, title, summary, source[, track])
 * @param {string}           now   ISO timestamp
 * @returns {object}               EntityWhat
 */
function mergeWhat(prev, next, now) {
  const hash = contentHash(next.summary);
  const changed = !prev || prev.contentHash !== hash;
  const badge = !prev ? "drafted" : changed ? "drafted" : prev.badge;
  return { ...next, badge, generatedAt: now, contentHash: hash };
}

/**
 * Post-process a Haiku paraphrase: strip em-dashes, collapse whitespace, cap sentences.
 * Duplicated from app/lib/paraphrase.ts — keep in sync.
 * @param {string} text
 * @param {number} maxSentences
 * @returns {string}
 */
function sanitizeParaphrase(text, maxSentences = 3) {
  const noDash = text.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
  const parts = noDash.match(/[^.!?]+[.!?]+/g) ?? [noDash];
  return parts.slice(0, maxSentences).map((s) => s.trim()).join(" ").trim();
}

// ---------------------------------------------------------------------------
// Wikipedia REST summary fetch
// @param {string} title  Exact Wikipedia article title
// @returns {Promise<{extract: string, url: string}>}
// ---------------------------------------------------------------------------
async function fetchWikipedia(title, attempt = 0) {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "sector4-entity-whats/1.0 (sector4.net)" },
  });
  // Rate-limited or transient upstream error: back off and retry (honour Retry-After).
  if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(1000 * 2 ** attempt, 15000);
    console.log(`  [retry ${attempt + 1}/${MAX_RETRIES}] ${title} — HTTP ${res.status}, waiting ${waitMs}ms`);
    await sleep(waitMs);
    return fetchWikipedia(title, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Wikipedia fetch failed for "${title}": HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.extract) {
    throw new Error(`Wikipedia returned no extract for "${title}"`);
  }
  return {
    extract: data.extract,
    url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encoded}`,
  };
}

// ---------------------------------------------------------------------------
// Haiku paraphrase call
// @param {string} extract  Wikipedia extract text
// @returns {Promise<string>}  Raw paraphrase (pre-sanitize)
// ---------------------------------------------------------------------------
async function callHaiku(extract) {
  const SYSTEM = [
    "You are a concise sports-encyclopaedia writer.",
    "Write a SHORT ORIGINAL paraphrase of the provided Wikipedia extract.",
    "Rules:",
    "- 2-3 sentences only.",
    "- Never quote or reproduce passages verbatim.",
    "- Never invent facts not present in the extract.",
    "- No em-dashes (use commas or restructure).",
    "- No Pirelli branding, no team logos, no likeness.",
    "- Output the paraphrase only, no preamble.",
  ].join(" ");
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 256,
    system: SYSTEM,
    messages: [{ role: "user", content: `Wikipedia extract:\n\n${extract}` }],
  });
  const block = msg.content.find((b) => b.type === "text");
  if (!block || !block.text) throw new Error("Haiku returned no text content");
  return block.text.trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("build-entity-whats: loading data files …");

  const titles = JSON.parse(readFileSync(TITLES_PATH, "utf8"));
  const drivers = JSON.parse(readFileSync(DRIVERS_PATH, "utf8"));
  const teams = JSON.parse(readFileSync(TEAMS_PATH, "utf8"));
  const prev = JSON.parse(readFileSync(WHATS_PATH, "utf8"));

  const now = new Date().toISOString();
  /** @type {Record<string, object>} */
  const next = { ...prev }; // start with all existing records; we overwrite when we rebuild

  let built = 0;
  let skippedNoTitle = 0;
  let skippedError = 0;
  let unchanged = 0;

  // Build entity list: circuits (from entity-titles), drivers, teams.
  // Entity key format: "type:slug" (mirrors entityKey in app/lib/entity-whats.ts).

  /** @type {Array<{type: string, slug: string, track?: string}>} */
  const entities = [];

  // Circuits: iterate keys defined in entity-titles.json[circuit].
  for (const slug of Object.keys(titles.circuit ?? {})) {
    entities.push({ type: "circuit", slug });
  }
  // Drivers: iterate keys from drivers.json.
  for (const code of Object.keys(drivers)) {
    entities.push({ type: "driver", slug: code });
  }
  // Teams: iterate keys from teams.json.
  for (const name of Object.keys(teams)) {
    entities.push({ type: "team", slug: name });
  }

  console.log(`build-entity-whats: ${entities.length} entities to process`);

  for (const entity of entities) {
    const { type, slug } = entity;
    const key = `${type}:${slug}`;
    const title = (titles[type] ?? {})[slug];

    if (!title) {
      console.log(`  [skip-no-title]  ${key}`);
      skippedNoTitle++;
      continue;
    }

    // Determine track display name for circuits (use title as fallback).
    const track = type === "circuit" ? title : undefined;

    try {
      // Polite gap between entities so a burst does not trip Wikipedia's rate limit.
      await sleep(THROTTLE_MS);

      // Fetch Wikipedia
      const { extract, url } = await fetchWikipedia(title);

      // Call Haiku
      const raw = await callHaiku(extract);

      // Sanitize
      const summary = sanitizeParaphrase(raw);

      // Build record
      const prevRecord = prev[key];
      const record = mergeWhat(
        prevRecord,
        { type, slug, title, summary, source: { label: "Wikipedia", url }, ...(track !== undefined ? { track } : {}) },
        now,
      );

      // Check if content actually changed
      if (prevRecord && prevRecord.contentHash === record.contentHash) {
        console.log(`  [unchanged]      ${key}`);
        unchanged++;
      } else {
        console.log(`  [built]          ${key}  (badge: ${record.badge})`);
        built++;
      }

      next[key] = record;
    } catch (err) {
      console.error(`  [error-skip]     ${key}  — ${err.message}`);
      skippedError++;
      // Never write a partial/guessed record — leave the previous record intact (or absent).
    }
  }

  // Write merged map: stable key order (sorted), 2-space indent, trailing newline.
  const sorted = Object.fromEntries(
    Object.entries(next).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(WHATS_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");

  console.log(
    `\nbuild-entity-whats: done — built=${built} unchanged=${unchanged} ` +
    `skipped-no-title=${skippedNoTitle} skipped-error=${skippedError}`
  );
  console.log(`Wrote: ${WHATS_PATH}`);

  if (skippedError > 0) {
    console.warn(
      `WARNING: ${skippedError} entities were skipped due to fetch/Haiku errors. ` +
      "Re-run to retry."
    );
    process.exit(2); // non-zero but not 1 (which means config error)
  }
}

main().catch((err) => {
  console.error("build-entity-whats: fatal error:", err);
  process.exit(1);
});
