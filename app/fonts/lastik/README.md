# Lastik (serif body font) — drop files here

Place the Lastik web font files in this folder. They are wired via `next/font/local`
as the **body / serif** type role (PRD §8). Until the files are present, the body
role falls back to a system serif so the build never breaks.

**What to drop:**
- `Lastik-Regular.woff2` (required) — plus `.woff` if you have it
- Optional extra weights/styles if licensed: `Lastik-Italic.woff2`, `Lastik-Medium.woff2`, etc.

**Notes:**
- `.woff2` is preferred (smallest); include `.woff` as a fallback if available.
- Confirm the license permits web embedding before committing the files.
- Filenames above are the expected defaults; if yours differ, the `next/font/local`
  config (added during M3-frontend implementation) is the single place to adjust paths.
