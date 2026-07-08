"use client";
// The /weekend "setting up" link + modal: the previous GP's frozen final podium call vs the
// actual result. Modal pattern cloned from app/page.tsx's DriverStopsModal (portal + fade/scale,
// Escape/backdrop close, reduced-motion gated). Data is shaped server-side by pastPredictionRows.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { driverName } from "@/app/lib/glyph";
import { BAND_TEXT } from "@/app/lib/bands";
import type { PastPredictionsData } from "@/app/lib/past-predictions";

interface Props {
  gpLabel: string;
  year: number;
  gp: string;
  data: PastPredictionsData;
}

export function PastPredictions({ gpLabel, year, gp, data }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cta-grow relative font-pixel text-xl leading-none tracking-wide text-accent transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        Check out {gpLabel} GP
      </button>
      {open && (
        <PastModal
          gpLabel={gpLabel}
          year={year}
          gp={gp}
          data={data}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PastModal({
  gpLabel,
  year,
  gp,
  data,
  onClose,
}: Props & { onClose: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    setShow(false);
    window.setTimeout(onClose, 180); // matches the transition duration
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  const { rows, hasActuals, summary } = data;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Our final ${year} ${gp} podium call versus the result`}
      onClick={close}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[75vh] w-full max-w-md flex-col rounded-2xl border border-ink/15 bg-white/95 shadow-xl transition duration-200 ease-out motion-reduce:transition-none ${
          show ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2.5">
          <div className="font-grotesk text-[11px] font-semibold uppercase tracking-wide text-muted">
            Previous race · {gpLabel} GP {year} · our final call
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-full px-2 py-0.5 font-grotesk text-sm text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">
          <table className="w-full border-collapse font-grotesk text-sm">
            <thead>
              <tr className="border-b border-ink/15 text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium"></th>
                <th className="py-2 pr-3 font-medium">Driver</th>
                <th className="py-2 pr-3 font-medium">Our call</th>
                <th className="py-2 pr-2 font-medium">p≈</th>
                {hasActuals && (
                  <th className="py-2 text-right font-medium">Finished</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={d.driver} className={i % 2 ? "bg-ink/[0.03]" : ""}>
                  <td className="py-2 pr-2 align-middle font-mono text-muted">{d.rank}</td>
                  <td className="py-1 pr-2 align-middle">
                    <AsciiGlyph code={d.driver} team={d.team} size={40} />
                  </td>
                  <td className="py-2 pr-3 align-middle">
                    <span className="font-bold tracking-wide">{d.driver}</span>{" "}
                    <span className="hidden text-muted sm:inline">{driverName(d.driver)}</span>
                  </td>
                  <td
                    className={`py-2 pr-3 align-middle font-semibold uppercase tracking-wide ${
                      BAND_TEXT[d.band] ?? BAND_TEXT["outside shot"]
                    }`}
                  >
                    {d.band}
                  </td>
                  <td className="py-2 pr-2 align-middle font-mono text-muted">
                    {d.p_podium ?? ""}
                  </td>
                  {hasActuals && (
                    <td className="py-2 text-right align-middle font-mono">
                      {d.finishPos == null ? (
                        <span className="text-muted">DNF</span>
                      ) : (
                        <span
                          className={
                            d.isPodium ? "font-semibold text-emerald-600" : "text-ink/70"
                          }
                        >
                          P{d.finishPos}
                          {d.isPodium ? " ✓" : ""}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {summary && (
            <p className="mt-3 font-grotesk text-xs text-muted">
              {summary.hits} of our top {summary.of} predicted finished on the podium.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
