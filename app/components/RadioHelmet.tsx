"use client";

// The landing intro microinteraction: the house helmet lifts, a dither pool appears beneath
// it, and a speech bubble plays one random team-radio line word by word. A different line
// every activation. Hover (mouse), tap (touch), and keyboard focus all drive the same path.
import { useEffect, useRef, useState } from "react";
import { HouseHelmet } from "@/app/components/HouseHelmet";
import { DitherShadow } from "@/app/components/DitherShadow";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";
import { pickRadioMessage, radioSteps, type RadioStep } from "@/app/lib/race-radio";

// The bubble opens at 380ms (see .radio-bubble in globals.css); words start once it's open.
const WORDS_DELAY_MS = 560;
// How long a tap keeps the bubble open. Generous enough for the longest line (11 words,
// roughly 2.1s of stepping after the 560ms lead-in) plus a comfortable hold.
const PIN_MS = 5200;

export function RadioHelmet({ size = 220 }: { size?: number }) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [steps, setSteps] = useState<RadioStep[]>([]);
  const [message, setMessage] = useState<string>("");
  const [announced, setAnnounced] = useState<string>("");
  const [stepIndex, setStepIndex] = useState(-1);
  const reduced = useReducedMotion();

  const active = hovering || pinned;

  // The message just shown, so the next pick never repeats it. A ref, not state: reading it
  // during the activation effect must not make that effect depend on it.
  const lastMessage = useRef<string | null>(null);
  const wordTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One place picks the message and schedules the words: the false -> true edge of `active`.
  // Every input path (hover, tap, focus) just flips a flag.
  useEffect(() => {
    const clearWordTimers = () => {
      wordTimers.current.forEach(clearTimeout);
      wordTimers.current = [];
    };

    if (!active) {
      clearWordTimers();
      setAnnounced("");
      return;
    }

    const next = pickRadioMessage(lastMessage.current);
    lastMessage.current = next;
    const nextSteps = radioSteps(next);
    setMessage(next);
    setAnnounced(next);
    setSteps(nextSteps);

    if (reduced) {
      // Reduced motion: the whole line is present immediately, never stepped.
      setStepIndex(nextSteps.length - 1);
      return;
    }

    setStepIndex(-1);
    nextSteps.forEach((step, i) => {
      wordTimers.current.push(setTimeout(() => setStepIndex(i), WORDS_DELAY_MS + step.atMs));
    });

    return clearWordTimers;
  }, [active, reduced]);

  // Clear the pin timer on unmount so a tapped-then-navigated-away helmet leaves nothing behind.
  useEffect(() => {
    return () => {
      if (pinTimer.current) clearTimeout(pinTimer.current);
    };
  }, []);

  const pinFor = (ms: number | null) => {
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = null;
    setPinned(true);
    if (ms !== null) pinTimer.current = setTimeout(() => setPinned(false), ms);
  };

  // Hover is mouse-only: on touch, pointerenter fires on tap and pointerleave fires the
  // instant the finger lifts, which would close the bubble before a word appeared. Touch
  // goes through onClick instead.
  const onPointerEnter = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse") setHovering(true);
  };
  const onPointerLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    setHovering(false);
    // A mouse click also pins for PIN_MS. Leaving the helmet should end that rather than
    // leave the bubble hanging with the pointer gone — unless the button holds keyboard
    // focus (:focus-visible), whose pin the mouse has no business cancelling. A mouse click
    // does focus the button in Chrome/Firefox, but does not match :focus-visible, so this
    // still only cancels a click-pin.
    if (!e.currentTarget.matches(":focus-visible") && pinTimer.current) {
      clearTimeout(pinTimer.current);
      pinTimer.current = null;
      setPinned(false);
    }
  };

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // `detail === 0` means the click came from the keyboard (Enter or Space on a focused
    // button), where focus already holds it open and an auto-close timer would fight that.
    pinFor(e.detail === 0 ? null : PIN_MS);
  };

  // Only keyboard focus should open it. A mouse click also focuses the button, but does not
  // match :focus-visible, so this stays out of the pointer path's way.
  const onFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.matches(":focus-visible")) pinFor(null);
  };
  const onBlur = () => {
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = null;
    setPinned(false);
  };

  const visibleText = stepIndex >= 0 ? (steps[stepIndex]?.text ?? "") : "";

  return (
    <div className="relative inline-block" data-radio-active={active ? "" : undefined}>
      {/* Bubble sits above the helmet. Its box is reserved by an invisible copy of the full
          message so words landing one at a time never reflow it. */}
      <div
        aria-hidden
        className="radio-bubble pointer-events-none absolute bottom-full left-0 z-20 mb-4 max-w-[17rem] rounded-2xl bg-white px-4 py-2.5 shadow-[0_2px_12px_rgba(37,31,68,0.12)] ring-1 ring-ink/10"
      >
        <span className="invisible block font-grotesk text-sm leading-snug text-ink">
          {message || " "}
        </span>
        <span className="absolute inset-0 px-4 py-2.5 font-grotesk text-sm leading-snug text-ink">
          {visibleText}
        </span>
      </div>

      {/* The full line, for screen readers: the animated copy above is aria-hidden so a
          reader never stutters through partial words. */}
      <span className="sr-only" aria-live="polite">
        {announced}
      </span>

      {/* The shadow pool is anchored to the helmet's base and wider than it, so it reads as
          ground contact rather than a glow around the shape.

          It is a SIBLING of the button, never a descendant. DitherShadow renders a <div>,
          and a <button> may only contain phrasing content — the parser would close the
          button early and hydration would mismatch. This is the same content-model trap the
          landing footer's WordmarkFog hit by nesting a <div> inside a <p>. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-4 left-1/2 z-0 h-16 w-[130%] -translate-x-1/2"
      >
        <DitherShadow active={active} />
      </div>

      <button
        type="button"
        aria-label="Play a team radio message"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        className="relative z-10 block cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent/60"
      >
        {/* <span> is safe here: HouseHelmet renders a <canvas> or an <svg>, both phrasing
            content. `block` is a CSS display, not a content-model change. */}
        <span className="radio-lift block">
          <HouseHelmet size={size} />
        </span>
      </button>
    </div>
  );
}
