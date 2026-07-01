"use client";

import { useState } from "react";
import type { EntityType } from "@/app/lib/entity-whats";

// Small "spotted something wrong?" disclosure that POSTs a reader correction to
// /api/correction. No em-dashes; font-grotesk text-[11px] to match badge scale;
// motion gated behind prefers-reduced-motion.
export function CorrectionForm({ type, slug }: { type: EntityType; slug: string }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, slug, note: note.trim() }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg((data as { error?: string }).error ?? "Something went wrong. Try again later.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Could not reach the server. Try again later.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="mt-3 font-grotesk text-[11px] text-muted">
        Thanks -- we will take a look.
      </p>
    );
  }

  return (
    <details className="mt-3 font-grotesk text-[11px]">
      <summary className="cursor-pointer select-none text-muted hover:text-ink">
        Spotted something wrong?
      </summary>
      <form onSubmit={handleSubmit} className="mt-2 space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Describe the issue..."
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded border border-ink/15 bg-transparent p-2 font-grotesk text-[11px] text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        {status === "error" && (
          <p className="font-grotesk text-[11px] text-red-600" role="alert">
            {errorMsg}
          </p>
        )}
        <button
          type="submit"
          disabled={status === "submitting" || !note.trim()}
          className="rounded bg-ink/5 px-3 py-1 font-grotesk text-[11px] font-semibold uppercase tracking-wide text-ink transition hover:bg-ink/10 disabled:opacity-40 motion-reduce:transition-none"
        >
          {status === "submitting" ? "Sending..." : "Send"}
        </button>
      </form>
    </details>
  );
}
