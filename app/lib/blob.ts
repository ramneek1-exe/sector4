// Thin Vercel Blob JSON wrapper (M5). Public access + deterministic pathnames
// (addRandomSuffix:false) so `latest.json` is overwritable and readable by key. Reads
// the token from BLOB_READ_WRITE_TOKEN automatically — the only env var Blob needs.
import { put, head } from "@vercel/blob";

export async function putJson(key: string, value: unknown): Promise<string> {
  const { url } = await put(key, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
  });
  return url;
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const meta = await head(key); // throws if the blob doesn't exist
    const res = await fetch(meta.url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
