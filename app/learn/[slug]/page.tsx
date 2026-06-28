// app/learn/[slug]/page.tsx
// A single concept what (M6-A): term, badge, summary lead, body, a set-apart "Why it
// matters" callout, related chips, and sources. Statically generated over the 8 slugs.
import Link from "next/link";
import { notFound } from "next/navigation";
import { allConcepts, getConcept, resolveRelated } from "@/app/lib/concepts";
import { emblemForGroup } from "@/app/lib/emblems";
import { TrustBadge } from "@/app/components/TrustBadge";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";

export function generateStaticParams() {
  return allConcepts().map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = getConcept(params.slug);
  return { title: c ? c.term : "Learn" }; // layout template adds " · Sector 4"
}

export default function ConceptPage({ params }: { params: { slug: string } }) {
  const concept = getConcept(params.slug);
  if (!concept) notFound();
  const related = resolveRelated(concept.slug);

  return (
    <main className="relative mx-auto max-w-2xl px-5 py-14 sm:py-20">
      {/* Large, faded brand emblem for this concept's theme — a thematic backdrop sitting
          right-of-centre behind the text, fully visible (no clipping) (PRD §8 dither). */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-[18%] -z-10 opacity-[0.08]"
      >
        <AsciiEmblem
          kind={emblemForGroup(concept.group)}
          size={emblemForGroup(concept.group) === "car" ? 580 : 440}
          cols={emblemForGroup(concept.group) === "car" ? 92 : 58}
          animate={false}
        />
      </div>

      <Link
        href="/learn"
        className="learn-rise cta-grow relative inline-block font-pixel text-xl tracking-wide text-muted transition-colors hover:text-ink"
      >
        ← Learn
      </Link>

      <header className="learn-rise mt-6 mb-8" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-bebas text-5xl leading-none text-ink sm:text-6xl">{concept.term}</h1>
          <TrustBadge badge={concept.badge} />
        </div>
        <p className="mt-4 font-lastik text-lg text-ink/80">{concept.summary}</p>
      </header>

      <div className="learn-rise space-y-4 font-lastik text-ink/90" style={{ animationDelay: "120ms" }}>
        {concept.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <aside
        className="learn-rise legible my-8 rounded-2xl border border-accent/30 bg-accent/[0.06] p-5"
        style={{ animationDelay: "180ms" }}
      >
        <h2 className="mb-2 font-grotesk text-xs font-semibold uppercase tracking-wide text-accent">
          Why it matters
        </h2>
        <p className="font-lastik text-ink/85">{concept.whyItMatters}</p>
      </aside>

      {related.length > 0 && (
        <section className="learn-rise mb-8" style={{ animationDelay: "240ms" }}>
          <h2 className="mb-3 font-grotesk text-xs font-semibold uppercase tracking-wide text-muted">
            Related
          </h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/learn/${r.slug}`}
                  className="inline-block rounded-full border border-ink/10 px-3 py-1 font-grotesk text-sm text-ink/80 transition hover:border-accent hover:text-ink"
                >
                  {r.term}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="learn-rise border-t border-ink/10 pt-5" style={{ animationDelay: "300ms" }}>
        <h2 className="mb-2 font-grotesk text-xs font-semibold uppercase tracking-wide text-muted">
          Sources
        </h2>
        <ul className="space-y-1">
          {concept.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-grotesk text-sm text-muted underline decoration-ink/20 underline-offset-2 transition hover:text-ink"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}
