import { NextResponse } from "next/server";
import { validateCorrection, issuePayload } from "@/app/lib/correction";

// Opens a GitHub issue for a reader correction. Token + repo are server-only env vars.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const c = validateCorrection(body);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 });

  const token = process.env.GITHUB_CORRECTIONS_TOKEN;
  const repo = process.env.GITHUB_CORRECTIONS_REPO; // e.g. "ramneek1-exe/sector4"
  if (!token || !repo) return NextResponse.json({ error: "corrections not configured" }, { status: 503 });

  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(issuePayload(c)),
    });
  } catch {
    // Network-level failure (DNS, timeout, reset): surface as a gateway error, not a 500.
    return NextResponse.json({ error: "could not file the correction" }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: "could not file the correction" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
