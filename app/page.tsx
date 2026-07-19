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
import { SectionReveal } from "@/app/components/SectionReveal";
import { SectorDivider } from "@/app/components/SectorDivider";
import { NAV_H, NAV_LINKS } from "@/app/lib/nav";
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
      <SectorDivider />
      <LearnTheSport />
      <SectorDivider />
      <ThisWeekend />
      <SectorDivider />
      <HonestByDesign liveScored={liveScored} />
      <LandingFooter />
    </>
  );
}

/** Oversized faded timing-sheet numeral ("S1".."S4"). Decorative; alternates side per
 *  section via the caller's positioning classes. */
function SectorNumeral({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-reveal
      className={`pointer-events-none select-none font-grotesk text-[7rem] font-bold leading-none tracking-tight text-ink/[0.06] sm:text-[10rem] ${className}`}
    >
      S{n}
    </span>
  );
}

/** Type-led dramatic open: the thesis IS the hero (no wordmark; the nav carries the
 *  brand). Dithered b-roll runs full-bleed behind it in the light site recipe; DitherFog
 *  remains the no-src/error fallback. `data-hero` attributes are the stable hooks the
 *  future preloader/reveal pass will target; keep them on these four layers. */
function Hero() {
  return (
    <section
      className="relative flex w-full items-center justify-center overflow-hidden"
      style={{ minHeight: `calc(100vh - ${NAV_H}px)` }}
    >
      <DitherVideo
        data-hero="video"
        src="/hero.mp4"
        colorBack="#fafafa"
        colorFront="#406cd6"
        cols={240}
        className="absolute inset-0 h-full w-full"
      >
        <DitherFog className="h-full w-full" />
      </DitherVideo>

      <div
        data-hero="thesis"
        className="legible relative z-10 flex flex-col items-center gap-7 px-10 py-14 text-center sm:px-16 sm:py-20"
      >
        <h1 className="fog-in max-w-4xl font-pixel-serif text-4xl leading-tight text-ink sm:text-6xl md:text-7xl">
          A lap has three sectors.
          <br />
          This is the one where you find out why.
        </h1>
        <Link
          data-hero="cta"
          href="/ask"
          style={{ animationDelay: "0.18s" }}
          className="fog-in mt-2 inline-flex h-12 items-center justify-center rounded-full bg-accent px-8 font-grotesk text-lg font-medium text-white shadow-sm transition duration-200 hover:-translate-y-px hover:bg-accent-bright motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Ask your first question
        </Link>
      </div>

      <div
        data-hero="cue"
        aria-hidden
        style={{ animationDelay: "0.36s" }}
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
    <section className="relative mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <SectionReveal>
        <div className="absolute -top-6 right-0 sm:-top-10">
          <SectorNumeral n={1} />
        </div>
        <p data-reveal className={SECTION_LABEL}>
          Sector 1 · Ask anything
        </p>
        <h2 data-reveal className={SECTION_HEADING}>
          Formula 1, minus the false confidence.
        </h2>
        <p data-reveal className={SECTION_BODY}>
          Podium odds, pit stops, tyre wear, the basics. Ask in plain English and get a
          straight answer that says what the data shows, and what it can&apos;t.
        </p>
        <div data-reveal className="mt-8 flex flex-wrap gap-3">
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
      </SectionReveal>
    </section>
  );
}

function LearnTheSport() {
  return (
    <section className="relative mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <SectionReveal className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="absolute -top-6 left-0 sm:-top-10">
          <SectorNumeral n={2} />
        </div>
        <div data-reveal>
          <AsciiEmblem kind="tyre" size={64} className="shrink-0" />
        </div>
        <div>
          <p data-reveal className={SECTION_LABEL}>
            Sector 2 · Learn the sport
          </p>
          <h2 data-reveal className={SECTION_HEADING}>
            Every answer teaches you something.
          </h2>
          <p data-reveal className={SECTION_BODY}>
            Predictions link straight to the concepts behind them: what tyre degradation
            is, why undercuts work, what a stop-count call actually means. Follow a
            thread and the sport starts making sense.
          </p>
          <Link data-reveal href="/learn" className={SECTION_LINK}>
            Start learning →
          </Link>
        </div>
      </SectionReveal>
    </section>
  );
}

function ThisWeekend() {
  const dateLabel = formatRaceDate(schedule.final);
  return (
    <section className="relative mx-auto w-full max-w-3xl px-6 py-20 sm:px-8 sm:py-28">
      <SectionReveal className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="absolute -top-6 right-0 sm:-top-10">
          <SectorNumeral n={3} />
        </div>
        <div data-reveal>
          <AsciiEmblem kind="car" size={64} className="shrink-0" />
        </div>
        <div>
          <p data-reveal className={SECTION_LABEL}>
            Sector 3 · This weekend
          </p>
          <h2 data-reveal className={SECTION_HEADING}>
            {gpLabel(schedule.gp)} Grand Prix
          </h2>
          <p data-reveal className={SECTION_BODY}>
            Race day is {dateLabel}. Calls go up Friday and sharpen through qualifying,
            and we say so while the picture is still fuzzy.
          </p>
          <Link data-reveal href="/weekend" className={SECTION_LINK}>
            See this weekend →
          </Link>
        </div>
      </SectionReveal>
    </section>
  );
}

function HonestByDesign({ liveScored }: { liveScored: number }) {
  return (
    <section className="relative bg-ink/[0.02]">
      <SectionReveal className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-20 sm:flex-row sm:items-start sm:px-8 sm:py-28">
        <div className="absolute -top-6 left-0 sm:-top-10">
          <SectorNumeral n={4} />
        </div>
        <div data-reveal>
          <AsciiEmblem kind="flag" size={64} className="shrink-0" />
        </div>
        <div>
          <p data-reveal className={SECTION_LABEL}>
            Sector 4 · Honest by design
          </p>
          <h2 data-reveal className={SECTION_HEADING}>
            The fourth sector is the truth.
          </h2>
          <p data-reveal className={SECTION_BODY}>
            We show bands, not fake precision. Early season, podium odds are qualitative:
            a shot, an outside shot, unlikely. Every call gets scored against the real
            finish, and the record is public, good or bad.
          </p>
          {liveScored > 0 && (
            <p data-reveal className="mt-3 font-grotesk text-sm text-muted">
              {liveScored} {liveScored === 1 ? "race" : "races"} scored live so far.
            </p>
          )}
          <Link data-reveal href="/accuracy" className={SECTION_LINK}>
            See the record →
          </Link>
        </div>
      </SectionReveal>
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
