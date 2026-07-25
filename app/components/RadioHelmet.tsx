"use client";

// The landing intro microinteraction: the house helmet lifts, a dither pool appears beneath
// it, and a speech bubble plays one random team-radio line word by word, never the line
// just shown. Hover (mouse), tap (touch), and keyboard focus all drive the same path. A
// repeat trigger while already active is a no-op: one activation plays one line.
import { useEffect, useRef, useState } from "react";
import { HouseHelmet } from "@/app/components/HouseHelmet";
import { DitherShadow } from "@/app/components/DitherShadow";
import { useReducedMotion } from "@/app/lib/use-reduced-motion";
import { pickRadioMessage, radioSteps } from "@/app/lib/race-radio";

// The bubble opens at 380ms (see .radio-bubble in globals.css); words start once it's open.
const WORDS_DELAY_MS = 560;
// A tapped bubble (touch, or a mouse click) lingers this long AFTER its final word lands,
// then auto-closes — the touch equivalent of a mouse leaving. Sized to the message, not a
// flat timeout, so a short line does not sit open as long as a long one. Keyboard focus is
// exempt: it stays open until blur.
const READ_HOLD_MS = 1200;

export function RadioHelmet({ size = 300 }: { size?: number }) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [announced, setAnnounced] = useState<string>("");
  const [stepIndex, setStepIndex] = useState(-1);
  const reduced = useReducedMotion();

  const active = hovering || pinned;

  // The message just shown, so the next pick never repeats it. A ref, not state: reading it
  // during the activation effect must not make that effect depend on it.
  const lastMessage = useRef<string | null>(null);
  const wordTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The auto-close timer for a tap/click pin, and a flag for whether THIS activation wants
  // one. Only a pointer tap/click sets the flag; hover closes on leave and keyboard focus
  // closes on blur, so neither auto-closes.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoClose = useRef(false);

  // One place picks the message and schedules the words: the false -> true edge of `active`.
  // Every input path (hover, tap, focus) just flips a flag.
  useEffect(() => {
    const clearTimers = () => {
      wordTimers.current.forEach(clearTimeout);
      wordTimers.current = [];
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };

    if (!active) {
      clearTimers();
      setAnnounced("");
      return;
    }

    const next = pickRadioMessage(lastMessage.current);
    lastMessage.current = next;
    const nextSteps = radioSteps(next);
    setMessage(next);
    setAnnounced(next);

    // For a tap/click activation, close the bubble a fixed hold AFTER the final word — the
    // touch/click equivalent of a mouse leaving. `fromMs` is when the last word has landed.
    const scheduleAutoClose = (fromMs: number) => {
      if (!autoClose.current) return;
      closeTimer.current = setTimeout(() => setPinned(false), fromMs + READ_HOLD_MS);
    };

    if (reduced) {
      // Reduced motion: the whole line is present immediately, never stepped, so the hold
      // runs from now.
      setStepIndex(nextSteps.length - 1);
      scheduleAutoClose(0);
      return clearTimers;
    }

    setStepIndex(-1);
    nextSteps.forEach((step, i) => {
      wordTimers.current.push(setTimeout(() => setStepIndex(i), WORDS_DELAY_MS + step.atMs));
    });
    const lastAt = nextSteps.length ? nextSteps[nextSteps.length - 1].atMs : 0;
    scheduleAutoClose(WORDS_DELAY_MS + lastAt);

    return clearTimers;
  }, [active, reduced]);

  // Clear the close timer on unmount so a tapped-then-navigated-away helmet leaves nothing behind.
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Open the bubble. `auto` = should it self-close after the message (a tap/click), or stay
  // until an explicit close (keyboard focus, cleared on blur)?
  const activate = (auto: boolean) => {
    autoClose.current = auto;
    setPinned(true);
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
    // A mouse click also opens a self-closing pin. Leaving the helmet should end it rather
    // than leave the bubble hanging with the pointer gone — unless the button holds keyboard
    // focus (:focus-visible), whose pin the mouse has no business cancelling. A mouse click
    // does focus the button in Chrome/Firefox, but does not match :focus-visible, so this
    // still only cancels a click-pin.
    if (!e.currentTarget.matches(":focus-visible")) {
      autoClose.current = false;
      setPinned(false);
    }
  };

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // `detail === 0` means the click came from the keyboard (Enter or Space on a focused
    // button), where focus already holds it open and an auto-close would fight that. A real
    // pointer tap/click (detail > 0) self-closes after the message.
    activate(e.detail !== 0);
  };

  // Only keyboard focus should open it. A mouse click also focuses the button, but does not
  // match :focus-visible, so this stays out of the pointer path's way.
  const onFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.matches(":focus-visible")) activate(false);
  };
  const onBlur = () => {
    autoClose.current = false;
    setPinned(false);
  };

  const words = message ? message.trim().split(/\s+/) : [];

  return (
    <div className="relative inline-block" data-radio-active={active ? "" : undefined}>
      {/* Bubble sits above the helmet. Every word renders from the start as its own span,
          `opacity: 0` until its step lands, so it occupies layout the whole time — the box
          is reserved naturally and no invisible reserve copy is needed. */}
      <div
        aria-hidden
        className="radio-bubble pointer-events-none absolute bottom-full left-0 z-20 mb-4 max-w-[17rem] rounded-2xl bg-white px-4 py-2.5 shadow-[0_2px_12px_rgba(37,31,68,0.12)] ring-1 ring-ink/10"
      >
        <span className="block font-grotesk text-sm leading-snug text-ink">
          {/* Team-radio waveform: five bars pulsing at staggered phases, the way the TV
              graphic animates while a radio clip plays. Leads the words; bars only animate
              while active (play-state gated on [data-radio-active] in globals.css). */}
          <span className="radio-wave" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          {words.map((word, i) => (
            <span key={i} className="radio-word" data-shown={i <= stepIndex ? "" : undefined}>
              {word}
            </span>
          ))}
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
        className="pointer-events-none absolute -bottom-2 left-1/2 z-0 h-12 w-[115%] -translate-x-1/2"
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
