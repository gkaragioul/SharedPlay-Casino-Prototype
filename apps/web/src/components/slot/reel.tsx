"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SymbolArt, randomFillerSymbol } from "./symbols";

export interface ReelHandle {
  /** Start the endless blurred spin, seamlessly from the symbols on screen. */
  startLoop(): void;
  /**
   * Decelerate onto `final` (top→bottom) with an overshoot bounce.
   * `onLand` fires at the moment the reel visually hits its stop.
   */
  stop(final: string[], opts: { turbo: boolean; onLand?: () => void }): Promise<void>;
  /** Jump to symbols without animation. */
  set(final: string[]): void;
  element(): HTMLDivElement | null;
}

interface ReelProps {
  cell: number;
  initial: string[];
  /** Row indexes (0..2) highlighted as part of a win. */
  highlight: ReadonlySet<number>;
  dim: boolean;
  anticipate: boolean;
}

const LOOP_LEN = 14;
const LOOP_SPEED = 24; // cells per second

export const Reel = forwardRef<ReelHandle, ReelProps>(function Reel(
  { cell, initial, highlight, dim, anticipate },
  ref,
) {
  const [strip, setStrip] = useState<string[]>(initial);
  const [spinning, setSpinning] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<string[]>(initial);
  const loopRef = useRef<{ anim: Animation; symbols: string[]; duration: number } | null>(null);
  const cellRef = useRef(cell);
  cellRef.current = cell;

  useImperativeHandle(ref, () => ({
    element: () => windowRef.current,

    set(final) {
      loopRef.current?.anim.cancel();
      loopRef.current = null;
      currentRef.current = final;
      setStrip(final);
      setSpinning(false);
    },

    startLoop() {
      const el = stripRef.current;
      if (!el) return;
      loopRef.current?.anim.cancel();
      const cur = currentRef.current;
      const body = [
        ...cur,
        ...Array.from({ length: LOOP_LEN - cur.length }, randomFillerSymbol),
      ];
      // Repeat the first window at the end so the loop wraps without a seam.
      const symbols = [...body, ...cur];
      flushSync(() => {
        setStrip(symbols);
        setSpinning(true);
      });
      const c = cellRef.current;
      const duration = (LOOP_LEN / LOOP_SPEED) * 1000;
      // Wind-up: nudge up, then fall into the endless loop.
      const windup = el.animate(
        [
          { transform: `translateY(${-LOOP_LEN * c}px)` },
          { transform: `translateY(${-LOOP_LEN * c - c * 0.22}px)` },
          { transform: `translateY(${-LOOP_LEN * c}px)` },
        ],
        { duration: 160, easing: "ease-in-out" },
      );
      const anim = el.animate(
        [{ transform: `translateY(${-LOOP_LEN * c}px)` }, { transform: "translateY(0px)" }],
        { duration, iterations: Infinity, easing: "linear", delay: 160 },
      );
      loopRef.current = { anim, symbols, duration };
      void windup;
    },

    stop(final, { turbo, onLand }) {
      return new Promise<void>((resolve) => {
        const el = stripRef.current;
        if (!el) {
          currentRef.current = final;
          setStrip(final);
          resolve();
          return;
        }
        const c = cellRef.current;
        const loop = loopRef.current;
        let visible: string[];
        let frac = 0;
        if (loop) {
          const elapsed = Math.max(0, Number(loop.anim.currentTime ?? 0) - 160);
          const p = (elapsed % loop.duration) / loop.duration;
          const top = LOOP_LEN * (1 - p);
          const base = Math.floor(top);
          frac = top - base;
          visible = [0, 1, 2, 3].map(
            (k) => loop.symbols[Math.min(base + k, loop.symbols.length - 1)] ?? "JACK",
          );
          loop.anim.cancel();
          loopRef.current = null;
        } else {
          visible = [...currentRef.current, randomFillerSymbol()];
        }

        const fillers = turbo ? 4 : 7;
        const stopStrip = [
          ...final,
          ...Array.from({ length: fillers }, randomFillerSymbol),
          ...visible,
        ];
        flushSync(() => setStrip(stopStrip));

        const start = -(final.length + fillers + frac) * c;
        const duration = turbo ? 260 : 480;
        const anim = el.animate(
          [
            { transform: `translateY(${start}px)`, easing: "cubic-bezier(0.3, 0.75, 0.45, 1)" },
            { transform: `translateY(${c * 0.14}px)`, offset: 0.8, easing: "ease-in-out" },
            { transform: "translateY(0px)" },
          ],
          { duration, fill: "forwards" },
        );
        window.setTimeout(() => setSpinning(false), duration * 0.5);
        window.setTimeout(() => onLand?.(), duration * 0.8);
        const done = () => {
          currentRef.current = final;
          flushSync(() => setStrip(final));
          anim.cancel();
          resolve();
        };
        anim.finished.then(done, done);
      });
    },
  }));

  const settled = strip.length === 3;

  return (
    <div
      ref={windowRef}
      className={`reel-window ${anticipate ? "reel-anticipate" : ""}`}
      style={{ width: cell, height: cell * 3 }}
    >
      <div ref={stripRef} className={`reel-strip ${spinning ? "reel-blur" : ""}`}>
        {strip.map((id, index) => {
          const win = settled && highlight.has(index);
          const faded = settled && dim && !highlight.has(index);
          return (
            <div
              key={`${index}-${id}`}
              className={`reel-cell ${win ? "cell-win" : ""} ${faded ? "cell-dim" : ""} ${
                settled && id === "ZEUS" ? "cell-wild" : ""
              }`}
              style={{ width: cell, height: cell }}
            >
              <SymbolArt id={id} className="h-[86%] w-[86%]" />
            </div>
          );
        })}
      </div>
      <div className="reel-shade" />
    </div>
  );
});
