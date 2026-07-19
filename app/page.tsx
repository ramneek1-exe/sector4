// The sector4.net landing page (Task 5, landing-page plan). Server component: the hero's
// video/fog canvas is the only client-side piece, and it lives entirely inside DitherVideo /
// DitherFog (both already "use client"), so no island needs extracting here. The "Honest by
// design" section does one live Blob read (season calibration index) and degrades to
// copy-only if it fails or returns nothing — see HonestByDesign below.
import Link from "next/link";
import type { Metadata } from "next";
import schedule from "@/app/data/weekend-schedule.json";
import { DitherVideo } from "@/app/components/DitherVideo";
import { DitherFog } from "@/app/components/DitherFog";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";
import { NAV_H, NAV_LINKS } from "@/app/components/SiteNav";
import { getJson } from "@/app/lib/blob";
import { seasonIndexKey } from "@/app/lib/snapshot";
import type { CalibrationRow } from "@/app/lib/calibration";
import { gpLabel } from "@/app/lib/circuits";

// The live scored-race count below reads Blob per request (no-store); mark the route
// dynamic explicitly, matching /accuracy and /weekend.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's "%s · Sector 4" template — the wordmark IS the
  // whole title here, not a page name to suffix.
  title: { absolute: "Sector 4" },
  description:
    "An F1 companion that tells you the truth about what it knows: honest podium odds, " +
    "real strategy calls, and the numbers behind them.",
};

const EXAMPLE_QUERIES = [
  "Who's likely to podium at the next race?",
  "How many pit stops at Monaco?",
  "What is DRS?",
  "How fast do tyres wear at Barcelona?",
];

const SECTION_LABEL =
  "mb-3 font-grotesk text-xs font-semibold uppercase tracking-[0.15em] text-muted";
const SECTION_HEADING = "font-pixel-serif text-4xl text-ink sm:text-5xl";
const SECTION_BODY = "mt-4 max-w-xl font-lastik text-lg leading-relaxed text-muted";
const SECTION_LINK =
  "cta-grow relative mt-5 inline-block font-pixel text-xl leading-none tracking-wide text-accent transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none";

function formatRaceDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export default async function LandingPage() {
  const index = await getJson<CalibrationRow[]>(seasonIndexKey(schedule.year));
  const liveScored = (index ?? []).filter((r) => !r.reconstructed).length;

  return (
    <>
      <Hero />
      <AskAnything />
      <HonestByDesign liveScored={liveScored} />
      <LearnTheSport />
      <ThisWeekend />
      <LandingFooter />
    </>
  );
}

/** Full-viewport dramatic open: dithered video (falls back to the ambient fog warp until
 *  the owner drops in licensed b-roll), wordmark + thesis + CTA in one soft halo, a
 *  breathing scroll cue below. Everything here is a one-shot .fog-in entrance, staggered. */
function Hero() {
  return (
    <section
      className="relative flex w-full items-center justify-center overflow-hidden"
      style={{ minHeight: `calc(100vh - ${NAV_H}px)` }}
    >
      <DitherVideo
        src="/hero.mp4"
        colorBack="#251F44"
        colorFront="#BEE2F0"
        cols={240}
        className="absolute inset-0 h-full w-full"
      >
        <DitherFog className="h-full w-full" />
      </DitherVideo>

      <div className="legible relative z-10 flex flex-col items-center gap-6 px-10 py-14 text-center sm:px-16 sm:py-20">
        <h1 className="fog-in font-bebas text-7xl leading-none tracking-wide text-ink sm:text-8xl md:text-9xl">
          SECTOR4
        </h1>
        <p
          style={{ animationDelay: "0.12s" }}
          className="fog-in max-w-xl font-lastik text-xl leading-relaxed text-ink/90 sm:text-2xl"
        >
          An F1 companion that tells you the truth about what it knows.
        </p>
        <Link
          href="/ask"
          style={{ animationDelay: "0.24s" }}
          className="fog-in mt-2 inline-flex h-12 items-center justify-center rounded-full bg-accent px-8 font-grotesk text-lg font-medium text-white shadow-sm transition duration-200 hover:-translate-y-px hover:bg-accent-bright motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Ask your first question
        </Link>
      </div>

      <div
        aria-hidden
        style={{ animationDelay: "0.4s" }}
        className="fog-in legible absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full p-3"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-bounce text-ink/60 motion-reduce:animate-none"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  );
}

function AskAnything() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <p className={SECTION_LABEL}>Ask anything</p>
      <h2 className={SECTION_HEADING}>Type a question. Get a straight answer.</h2>
      <p className={SECTION_BODY}>
        Podium odds, pit stops, tyre wear, the basics. Ask in plain English and get a grounded
        explanation, not a guess dressed up as certainty.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {EXAMPLE_QUERIES.map((q) => (
          <Link
            key={q}
            href={`/ask?q=${encodeURIComponent(q)}`}
            className="rounded-2xl border border-ink/10 bg-white/90 px-4 py-2.5 font-grotesk text-sm text-ink/80 shadow-sm transition hover:border-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {q}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The calibration pitch. `liveScored` is the count of non-reconstructed (actually-live)
 *  scored races from the season index; the line only renders when that fetch succeeded
 *  and found at least one, so a Blob outage or an empty season just drops the line rather
 *  than showing a false zero. */
function HonestByDesign({ liveScored }: { liveScored: number }) {
  return (
    <section className="border-t border-ink/10 bg-ink/[0.02]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-20 sm:flex-row sm:items-start sm:px-8 sm:py-28">
        <AsciiEmblem kind="flag" size={64} className="shrink-0" />
        <div>
          <p className={SECTION_LABEL}>Honest by design</p>
          <h2 className={SECTION_HEADING}>We show bands, not fake precision.</h2>
          <p className={SECTION_BODY}>
            Early season, podium odds are qualitative: a shot, an outside shot, unlikely. No
            invented percentages. Every call we make gets scored against the real finish, and
            we publish the record, good or bad.
          </p>
          {liveScored > 0 && (
            <p className="mt-3 font-grotesk text-sm text-muted">
              {liveScored} {liveScored === 1 ? "race" : "races"} scored live so far.
            </p>
          )}
          <Link href="/accuracy" className={SECTION_LINK}>
            See the record →
          </Link>
        </div>
      </div>
    </section>
  );
}

function LearnTheSport() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <AsciiEmblem kind="tyre" size={64} className="shrink-0" />
        <div>
          <p className={SECTION_LABEL}>Learn the sport</p>
          <h2 className={SECTION_HEADING}>Every answer teaches something.</h2>
          <p className={SECTION_BODY}>
            Predictions link straight to the concepts behind them: what tyre degradation is,
            why undercuts work, what a stop-count call actually means. No jargon left
            unexplained.
          </p>
          <Link href="/learn" className={SECTION_LINK}>
            Start learning →
          </Link>
        </div>
      </div>
    </section>
  );
}

function ThisWeekend() {
  const dateLabel = formatRaceDate(schedule.final);
  return (
    <section className="border-t border-ink/10 bg-ink/[0.02]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-20 sm:flex-row sm:items-start sm:px-8 sm:py-28">
        <AsciiEmblem kind="car" size={64} className="shrink-0" />
        <div>
          <p className={SECTION_LABEL}>This weekend</p>
          <h2 className={SECTION_HEADING}>{gpLabel(schedule.gp)} Grand Prix</h2>
          <p className={SECTION_BODY}>
            Race day is {dateLabel}. Predictions go up Friday and sharpen through qualifying.
          </p>
          <Link href="/weekend" className={SECTION_LINK}>
            See this weekend →
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <div className="border-t border-ink/10 px-6 py-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4">
        <span className="font-bebas text-2xl tracking-wide text-ink">SECTOR4</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="font-grotesk text-sm text-muted transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
