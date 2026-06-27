// app/learn/page.tsx
// /learn index (M6-A): a "Learn" section heading in PP Mondwest, then the concept cards
// grouped thematically. Server component — static, legibility-first (no active fog).
import Link from "next/link";
import { conceptsByGroup } from "@/app/lib/concepts";
import { TrustBadge } from "@/app/components/TrustBadge";

export const metadata = { title: "Learn — Sector 4" };

export default function LearnPage() {
  const groups = conceptsByGroup();
  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <header className="mb-12">
        <h1 className="font-pixel-serif text-5xl text-ink sm:text-6xl">Learn</h1>
        <p className="mt-3 max-w-prose font-lastik text-muted">
          The ideas behind the predictions — tyres, strategy, pace, and air. Short,
          grounded explainers you can read in a minute.
        </p>
      </header>

      {groups.map(({ group, concepts }) => (
        <section key={group} className="mb-12">
          <h2 className="mb-4 font-grotesk text-xs font-semibold uppercase tracking-wide text-muted">
            {group}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {concepts.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/learn/${c.slug}`}
                  className="legible flex h-full flex-col gap-2 rounded-2xl border border-ink/10 bg-white/80 p-4 transition hover:border-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-grotesk text-base font-bold text-ink">{c.term}</span>
                    <TrustBadge badge={c.badge} />
                  </div>
                  <span className="font-lastik text-sm text-muted">{c.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
