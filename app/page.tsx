import Link from "next/link";

// TEMPORARY placeholder for the marketing landing page (Task 5 of the
// landing-page plan replaces this). Keeps the branch buildable while the
// Ask page lives at /ask.
export default function Home() {
  return (
    <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-5 pb-16 pt-10 text-center sm:px-8">
      <h1 className="font-bebas text-6xl tracking-wide text-ink sm:text-7xl">SECTOR4</h1>
      <Link
        href="/ask"
        className="cta-grow relative font-pixel text-2xl leading-none tracking-wide text-accent transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        Ask →
      </Link>
      <p className="font-grotesk text-xs uppercase tracking-wide text-muted">
        Landing page under construction.
      </p>
    </main>
  );
}
