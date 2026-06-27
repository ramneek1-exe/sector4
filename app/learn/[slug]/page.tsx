// app/learn/[slug]/page.tsx
// A single concept what (M6-A): term, badge, summary lead, body, a set-apart "Why it
// matters" callout, related chips, and sources. Statically generated over the 8 slugs.
import Link from "next/link";
import { notFound } from "next/navigation";
import { allConcepts, getConcept, resolveRelated } from "@/app/lib/concepts";
import { TrustBadge } from "@/app/components/TrustBadge";

export function generateStaticParams() {
  return allConcepts().map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = getConcept(params.slug);
  return { title: c ? `${c.term} — Sector 4` : "Learn — Sector 4" };
}

export default function ConceptPage({ params }: { params: { slug: string } }) {
  const concept = getConcept(params.slug);
  if (!concept) notFound();
  const related = resolveRelated(concept.slug);

  return (
    <main className="mx-auto max-w-2xl px-5 py-14 sm:py-20">
      <Link href="/learn" className="font-grotesk text-xs text-muted transition hover:text-ink">
        ← Learn
      </Link>

      <header className="mt-6 mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-bebas text-5xl leading-none text-ink sm:text-6xl">{concept.term}</h1>
          <TrustBadge badge={concept.badge} />
        </div>
        <p className="mt-4 font-lastik text-lg text-ink/80">{concept.summary}</p>
      </header>

      <div className="space-y-4 font-lastik text-ink/90">
        {concept.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <aside className="legible my-8 rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
        <h2 className="mb-2 font-grotesk text-xs font-semibold uppercase tracking-wide text-accent">
          Why it matters
        </h2>
        <p className="font-lastik text-ink/85">{concept.whyItMatters}</p>
      </aside>

      {related.length > 0 && (
        <section className="mb-8">
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

      <footer className="border-t border-ink/10 pt-5">
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
