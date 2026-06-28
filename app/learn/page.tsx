// /learn index (M6-A): a PP Mondwest "Learn" header + the concept cards grouped
// thematically. Server component — static; the per-card fog hover is a client island.
// Wider than reading width so the cards breathe. (A distinct ASCII brand element for this
// page is planned separately.)
import { conceptsByGroup } from "@/app/lib/concepts";
import { emblemForGroup } from "@/app/lib/emblems";
import { ConceptCard } from "@/app/components/ConceptCard";
import { AsciiEmblem } from "@/app/components/AsciiEmblem";

export const metadata = { title: "Learn" };

export default function LearnPage() {
  const groups = conceptsByGroup();
  // A running index across all cards drives a single cascading rise on page enter.
  let card = 0;
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8">
      <header className="learn-rise mb-12">
        <h1 className="font-pixel-serif text-5xl text-ink sm:text-6xl">Learn</h1>
        <p className="mt-3 max-w-prose font-lastik text-muted">
          The ideas behind the predictions — tyres, strategy, pace, and air. Short,
          grounded explainers you can read in a minute.
        </p>
      </header>

      {groups.map(({ group, concepts }, gi) => (
        <section key={group} className="mb-12">
          <div
            className="learn-rise mb-4 flex items-center gap-2.5"
            style={{ animationDelay: `${90 + gi * 60}ms` }}
          >
            <AsciiEmblem
              kind={emblemForGroup(group)}
              size={emblemForGroup(group) === "car" ? 52 : 32}
              cols={emblemForGroup(group) === "car" ? 34 : 20}
              className="shrink-0"
            />
            <h2 className="font-grotesk text-xs font-semibold uppercase tracking-wide text-muted">
              {group}
            </h2>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {concepts.map((c) => {
              const delay = 150 + card++ * 55;
              return (
                <li key={c.slug} className="learn-rise" style={{ animationDelay: `${delay}ms` }}>
                  <ConceptCard concept={c} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
