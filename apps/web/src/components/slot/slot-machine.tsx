"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TempleBonusResultView, TempleOfZeusView, WinningLineView } from "@sharedplay/types";
import { PAYLINES } from "@sharedplay/games/temple-of-zeus/paytable";
import { formatCredits } from "@/lib/format";
import { getSlotAudio } from "./audio";
import { ParticleField } from "./particles";
import { Reel, type ReelHandle } from "./reel";
import { SymbolDefs } from "./symbols";
import { Paytable } from "./paytable";

const BET_LEVELS = [1, 2, 5, 10, 20, 50] as const;
const REELS = 5;
const ROWS = 3;
const GAP = 8;
const AUTOPLAY_OPTIONS = [10, 25, 50, 100] as const;

const START_GRID: string[][] = [
  ["ACE", "ZEUS", "KING"],
  ["LAUREL", "LIGHTNING", "QUEEN"],
  ["TEMPLE", "EAGLE", "COIN"],
  ["JACK", "LIGHTNING", "SHIELD"],
  ["KING", "ZEUS", "ACE"],
];

type Phase = "idle" | "spinning" | "presenting" | "bonus";
type Tier = "BIG WIN" | "MEGA WIN" | "EPIC WIN";

interface SpinResponse {
  bankroll: number;
  payout: number;
  bonusTriggered: boolean;
  view: TempleOfZeusView | { game: string } | null;
  bet: number;
}

/** A resolved round, normalised so solo and shared play present identically. */
export interface SpinOutcome {
  bankroll: number;
  payout: number;
  reels: string[][];
  lines: WinningLineView[];
  scatters: number;
  /** Free-spins result to play out now (solo); shared bonuses arrive as replays. */
  bonus: TempleBonusResultView | null;
}

/** Another player's round (or a group bonus) to animate for everyone watching. */
export type SlotReplay =
  | {
      id: string;
      kind: "round";
      bet: number;
      /** Pot when the bet was taken — where the counter starts. */
      bankrollBefore: number;
      /** Pot after the round settled — where the counter ends. */
      bankroll: number;
      outcome: SpinOutcome;
      byName: string;
    }
  | {
      id: string;
      kind: "bonus";
      bet: number;
      bankrollBefore: number;
      bankroll: number;
      result: TempleBonusResultView;
    };

/** Shared-table mode: the balance is the group pot and spins go over the socket. */
export interface SharedSlotConfig {
  balanceLabel: string;
  pot: number;
  canSpin: boolean;
  lockedReason: string | null;
  requestSpin: (bet: number) => Promise<SpinOutcome>;
  replays: SlotReplay[];
  sidebar: ReactNode;
  banner?: ReactNode;
  subtitle?: string;
  backHref?: string;
  onReplayStart?: (replay: SlotReplay) => void;
}

export function countScatters(reels: string[][]): number {
  return reels.reduce((n, col) => n + col.filter((s) => s === "TEMPLE").length, 0);
}

interface BonusHud {
  stage: "intro" | "playing" | "outro";
  label: string;
  multiplier: number;
  spinIndex: number;
  spinCount: number;
  total: number;
  trigger: "scatter" | "team";
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function tierFor(win: number, bet: number): Tier | null {
  const ratio = win / bet;
  if (ratio >= 50) return "EPIC WIN";
  if (ratio >= 25) return "MEGA WIN";
  if (ratio >= 10) return "BIG WIN";
  return null;
}

function lineColor(line: number): string {
  return `hsl(${(line * 47) % 360} 95% 62%)`;
}

export function SlotMachine({
  gameName,
  startBalance,
  displayName,
  shared,
}: {
  gameName: string;
  startBalance: number;
  displayName: string;
  shared?: SharedSlotConfig;
}) {
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const audio = useMemo(() => getSlotAudio(), []);
  const [balance, setBalance] = useState(startBalance);
  const [betIndex, setBetIndex] = useState(3);
  const bet = BET_LEVELS[betIndex] ?? 10;
  const [phase, setPhase] = useState<Phase>("idle");
  const [grid, setGrid] = useState<string[][]>(START_GRID);
  const [highlights, setHighlights] = useState<Set<number>[]>(() =>
    Array.from({ length: REELS }, () => new Set<number>()),
  );
  const [dim, setDim] = useState(false);
  const [lines, setLines] = useState<WinningLineView[]>([]);
  const [lineCursor, setLineCursor] = useState<number>(-1);
  const [anticipate, setAnticipate] = useState<boolean[]>(Array(REELS).fill(false));
  const [winDisplay, setWinDisplay] = useState(0);
  const [winLabel, setWinLabel] = useState<string>("");
  const [bigWin, setBigWin] = useState<{ tier: Tier; amount: number } | null>(null);
  const [bonus, setBonus] = useState<BonusHud | null>(null);
  const [flash, setFlash] = useState(0);
  const shakeRef = useRef<HTMLDivElement>(null);
  const shake = useCallback(() => {
    shakeRef.current?.animate(
      [
        { transform: "translate(0,0)" },
        { transform: "translate(-3px,1px)" },
        { transform: "translate(6px,-2px)" },
        { transform: "translate(-8px,2px)" },
        { transform: "translate(8px,-1px)" },
        { transform: "translate(-6px,2px)" },
        { transform: "translate(4px,-1px)" },
        { transform: "translate(0,0)" },
      ],
      { duration: 550, easing: "cubic-bezier(0.36,0.07,0.19,0.97)" },
    );
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [turbo, setTurbo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [music, setMusic] = useState(true);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoMenu, setAutoMenu] = useState(false);
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [history, setHistory] = useState<{ id: number; win: number; bet: number }[]>([]);
  const [cell, setCell] = useState(132);

  const reelRefs = useRef<(ReelHandle | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const reelsBoxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<ParticleField | null>(null);
  const skipRef = useRef(false);
  const busyRef = useRef(false);
  const autoRef = useRef(0);
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const betRef = useRef(bet);
  betRef.current = bet;
  const bigWinDoneRef = useRef<(() => void) | null>(null);
  const bonusAdvanceRef = useRef<(() => void) | null>(null);

  // ─── layout ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      // frame padding (2×14) + inner padding (2×12) + a little breathing room
      const w = el.clientWidth - 60;
      const reserve = window.innerWidth < 640 ? 360 : 300;
      const h = window.innerHeight - reserve;
      const byW = Math.floor((w - GAP * (REELS - 1)) / REELS);
      const byH = Math.floor(h / ROWS);
      setCell(Math.max(44, Math.min(176, byW, byH)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const field = new ParticleField(canvasRef.current);
    fieldRef.current = field;
    return () => {
      field.dispose();
      fieldRef.current = null;
    };
  }, []);

  useEffect(() => () => audio.dispose(), [audio]);

  // ─── helpers ───────────────────────────────────────────────────────────
  const cellCenter = useCallback(
    (reel: number, row: number) => {
      const canvas = canvasRef.current;
      const box = reelsBoxRef.current;
      if (!canvas || !box) return { x: 0, y: 0 };
      const c = canvas.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      return {
        x: b.left - c.left + reel * (cell + GAP) + cell / 2,
        y: b.top - c.top + row * cell + cell / 2,
      };
    },
    [cell],
  );

  const clearWins = useCallback(() => {
    setHighlights(Array.from({ length: REELS }, () => new Set<number>()));
    setDim(false);
    setLines([]);
    setLineCursor(-1);
    setWinLabel("");
  }, []);

  const showPositions = useCallback((positions: number[]) => {
    const sets = Array.from({ length: REELS }, () => new Set<number>());
    for (const pos of positions) {
      sets[Math.floor(pos / ROWS)]?.add(pos % ROWS);
    }
    setHighlights(sets);
    setDim(positions.length > 0);
  }, []);

  const countUp = useCallback(
    async (from: number, to: number, ms: number) => {
      if (to <= from) {
        setWinDisplay(to);
        return;
      }
      const start = performance.now();
      let lastTick = 0;
      await new Promise<void>((resolve) => {
        const frame = (now: number) => {
          const t = skipRef.current ? 1 : Math.min(1, (now - start) / ms);
          const eased = 1 - Math.pow(1 - t, 3);
          setWinDisplay(Math.round(from + (to - from) * eased));
          if (now - lastTick > 65 && t < 1) {
            audio.coinTick();
            lastTick = now;
          }
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
    },
    [audio],
  );

  const celebrate = useCallback(
    async (amount: number, stake: number) => {
      const tier = tierFor(amount, stake);
      if (!tier) return;
      audio.bigWin();
      fieldRef.current?.coinRain(tier === "EPIC WIN" ? 220 : tier === "MEGA WIN" ? 150 : 90);
      shake();
      setBigWin({ tier, amount });
      await Promise.race([
        sleep(turboRef.current ? 2200 : 3800),
        new Promise<void>((r) => {
          bigWinDoneRef.current = r;
        }),
      ]);
      bigWinDoneRef.current = null;
      setBigWin(null);
    },
    [audio, shake],
  );

  const burstWins = useCallback(
    (positions: number[], amount: number, stake: number) => {
      const field = fieldRef.current;
      if (!field) return;
      // Wins below the stake get a highlight only — no celebration for a net loss.
      if (amount < stake) {
        for (const pos of new Set(positions)) {
          const { x, y } = cellCenter(Math.floor(pos / ROWS), pos % ROWS);
          field.sparks(x, y, 6);
        }
        return;
      }
      const uniq = Array.from(new Set(positions));
      const per = Math.min(14, 3 + Math.round((amount / stake) * 1.5));
      for (const pos of uniq) {
        const { x, y } = cellCenter(Math.floor(pos / ROWS), pos % ROWS);
        field.sparks(x, y, 10);
        field.coinBurst(x, y, per);
      }
    },
    [cellCenter],
  );

  /** Spin the reels and land them on `target`. */
  const spinTo = useCallback(
    async (
      fetchTarget: () => Promise<string[][] | null>,
      opts: { minSpin: number },
    ): Promise<string[][] | null> => {
      const reels = reelRefs.current;
      audio.spinStart();
      for (let i = 0; i < REELS; i += 1) {
        reels[i]?.startLoop();
        await sleep(turboRef.current ? 0 : 45);
      }
      const [target] = await Promise.all([fetchTarget(), sleep(opts.minSpin)]);
      const final = target ?? grid;

      // Anticipation: two scatters on the board raise the tension on later reels.
      let scatters = 0;
      const stops: Promise<void>[] = [];
      const anticip = Array(REELS).fill(false) as boolean[];
      for (let i = 0; i < REELS; i += 1) {
        const column = final[i] ?? ["JACK", "JACK", "JACK"];
        const slow = scatters >= 2 && !turboRef.current && !skipRef.current;
        if (slow) {
          anticip[i] = true;
          setAnticipate([...anticip]);
          audio.anticipation();
          await sleep(900);
        } else if (i > 0) {
          await sleep(skipRef.current ? 0 : turboRef.current ? 70 : 190);
        }
        const hasScatter = column.includes("TEMPLE");
        const reelIndex = i;
        stops.push(
          reels[i]?.stop(column, {
            turbo: turboRef.current || skipRef.current,
            onLand: () => {
              audio.reelStop(reelIndex);
              if (hasScatter) {
                audio.scatterLand();
                const row = column.indexOf("TEMPLE");
                const { x, y } = cellCenter(reelIndex, row);
                fieldRef.current?.sparks(x, y, 26, 48);
              }
            },
          }) ?? Promise.resolve(),
        );
        scatters += column.filter((s) => s === "TEMPLE").length;
      }
      await Promise.all(stops);
      audio.stopSpinLoop();
      setAnticipate(Array(REELS).fill(false));
      setGrid(final);
      return target;
    },
    [audio, cellCenter, grid],
  );

  const presentLines = useCallback(
    async (winLines: WinningLineView[], amount: number, stake: number, scatterPositions: number[]) => {
      const all = [...winLines.flatMap((l) => l.positions), ...scatterPositions];
      if (all.length === 0) return;
      setLines(winLines);
      setLineCursor(-1);
      showPositions(all);
      burstWins(all, amount, stake);
      if (amount >= stake) audio.smallWin();
      else audio.lineHighlight(0);
      if (scatterPositions.length >= 3) setFlash((f) => f + 1);
      setWinLabel(
        winLines.length > 0
          ? `${winLines.length} winning line${winLines.length > 1 ? "s" : ""} · win ${formatCredits(amount)}`
          : `Scatter win · ${formatCredits(amount)}`,
      );
    },
    [audio, burstWins, showPositions],
  );

  const playBonus = useCallback(
    async (result: TempleBonusResultView, stake: number, runningWin: number) => {
      const pathLabel = result.path === "LIGHTNING" ? "Lightning Path" : "Shield Path";
      setPhase("bonus");
      audio.bonusStart();
      setFlash((f) => f + 1);
      shake();
      const hud: BonusHud = {
        stage: "intro",
        label: pathLabel,
        multiplier: result.multiplier,
        spinIndex: 0,
        spinCount: result.spins.length,
        total: 0,
        trigger: result.trigger,
      };
      setBonus(hud);
      await Promise.race([
        sleep(3200),
        new Promise<void>((r) => {
          bonusAdvanceRef.current = r;
        }),
      ]);
      bonusAdvanceRef.current = null;

      let total = 0;
      for (let i = 0; i < result.spins.length; i += 1) {
        const spin = result.spins[i]!;
        clearWins();
        setBonus({ ...hud, stage: "playing", spinIndex: i + 1, total });
        await spinTo(async () => spin.reels, { minSpin: turboRef.current ? 150 : 450 });
        if (spin.win > 0) {
          await presentLines(spin.winningLines, spin.win, stake, []);
          const before = runningWin + total;
          total += spin.win;
          setBonus({ ...hud, stage: "playing", spinIndex: i + 1, total });
          await countUp(before, runningWin + total, turboRef.current ? 350 : 800);
          await sleep(turboRef.current ? 250 : 650);
        } else {
          await sleep(turboRef.current ? 150 : 380);
        }
      }
      clearWins();
      setBonus({ ...hud, stage: "outro", spinIndex: result.spins.length, total });
      audio.smallWin();
      await Promise.race([
        sleep(2800),
        new Promise<void>((r) => {
          bonusAdvanceRef.current = r;
        }),
      ]);
      bonusAdvanceRef.current = null;
      setBonus(null);
      await celebrate(total, stake);
      return total;
    },
    [audio, celebrate, clearWins, countUp, presentLines, shake, spinTo],
  );

  // ─── the round ─────────────────────────────────────────────────────────
  /** Present a landed result: line wins, scatters, count-up, bonus, celebration. */
  const presentOutcome = useCallback(
    async (o: SpinOutcome, stake: number) => {
      const bonusResult = o.bonus;
      const bonusWin = bonusResult?.totalWin ?? 0;
      const baseWin = o.payout - bonusWin;

      const scatterPositions: number[] = [];
      if (o.scatters >= 3) {
        o.reels.forEach((col, r) =>
          col.forEach((sym, row) => {
            if (sym === "TEMPLE") scatterPositions.push(r * ROWS + row);
          }),
        );
      }

      if (baseWin > 0 || scatterPositions.length > 0) {
        setPhase("presenting");
        await presentLines(o.lines, baseWin, stake, scatterPositions);
        await countUp(0, baseWin, turboRef.current ? 300 : Math.min(1800, 500 + (baseWin / stake) * 80));
        if (!bonusResult) await celebrate(baseWin, stake);
      }

      if (bonusResult) {
        await sleep(turboRef.current ? 200 : 700);
        await playBonus(bonusResult, stake, baseWin);
        setWinDisplay(o.payout);
        await celebrate(o.payout, stake);
      }
    },
    [celebrate, countUp, playBonus, presentLines],
  );

  const playRound = useCallback(async (): Promise<boolean> => {
    if (busyRef.current) return false;
    const sh = sharedRef.current;
    if (sh && !sh.canSpin) {
      setError(sh.lockedReason ?? "Only the player in control can spin.");
      audio.error();
      return false;
    }
    const stake = betRef.current;
    if (balanceRef.current < stake) {
      setError(sh ? "The shared pot can't cover this bet." : "Not enough demo credits for this bet.");
      audio.error();
      return false;
    }
    busyRef.current = true;
    skipRef.current = false;
    setError(null);
    clearWins();
    setWinDisplay(0);
    setPhase("spinning");
    const before = balanceRef.current;
    setBalance(before - stake);

    let outcome: SpinOutcome | null = null;
    let failure: string | null = null;
    try {
      await spinTo(
        async () => {
          try {
            if (sh) {
              outcome = await sh.requestSpin(stake);
              return outcome.reels;
            }
            const res = await fetch("/api/solo/spin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug: "temple-of-zeus", bet: stake }),
            });
            const data = await res.json();
            if (!res.ok) {
              failure = data.error ?? "Spin failed.";
              return null;
            }
            const resp = data as SpinResponse;
            const view = resp.view as TempleOfZeusView | null;
            if (!view || view.game !== "temple-of-zeus") {
              failure = "Spin failed.";
              return null;
            }
            outcome = {
              bankroll: resp.bankroll,
              payout: resp.payout,
              reels: view.reels,
              lines: view.lastLines,
              scatters: view.lastScatters,
              bonus: resp.bonusTriggered ? view.lastBonusResult : null,
            };
            return view.reels;
          } catch (err) {
            failure = err instanceof Error && sh ? err.message : "Network error — try again.";
            return null;
          }
        },
        { minSpin: turboRef.current ? 180 : 650 },
      );
    } finally {
      audio.stopSpinLoop();
    }

    const result = outcome as SpinOutcome | null;
    if (!result || failure) {
      setBalance(before);
      setError(failure ?? "Spin failed.");
      audio.error();
      setPhase("idle");
      busyRef.current = false;
      return false;
    }

    await presentOutcome(result, stake);

    setBalance(result.bankroll);
    setHistory((h) => [{ id: Date.now(), win: result.payout, bet: stake }, ...h].slice(0, 12));
    setPhase("idle");
    busyRef.current = false;
    return true;
  }, [audio, clearWins, presentOutcome, spinTo]);

  // ─── shared table: replays of other players' rounds and group bonuses ─
  const playReplay = useCallback(
    async (r: SlotReplay) => {
      busyRef.current = true;
      skipRef.current = false;
      setError(null);
      clearWins();
      setWinDisplay(0);
      sharedRef.current?.onReplayStart?.(r);
      if (r.kind === "round") {
        setPhase("spinning");
        setBalance(r.bankrollBefore);
        try {
          await spinTo(async () => r.outcome.reels, { minSpin: turboRef.current ? 180 : 550 });
        } finally {
          audio.stopSpinLoop();
        }
        await presentOutcome(r.outcome, r.bet);
        setHistory((h) => [{ id: Date.now(), win: r.outcome.payout, bet: r.bet }, ...h].slice(0, 12));
      } else {
        setBalance(r.bankrollBefore);
        await playBonus(r.result, r.bet, 0);
        setWinDisplay(r.result.totalWin);
      }
      setBalance(r.bankroll);
      setPhase("idle");
      busyRef.current = false;
    },
    [audio, clearWins, playBonus, presentOutcome, spinTo],
  );

  const seenReplays = useRef<Set<string> | null>(null);
  const replayQueue = useRef<SlotReplay[]>([]);
  const draining = useRef(false);
  const potRef = useRef<number | undefined>(undefined);
  const drainReplays = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      // Yield once: the queue is filled from an effect, and the reels call
      // flushSync — which React refuses to run while it is still committing.
      await sleep(0);
      while (replayQueue.current.length > 0) {
        while (busyRef.current) await sleep(120);
        const next = replayQueue.current.shift();
        if (next) await playReplay(next);
        await sleep(250);
      }
      // Land on the freshest server pot once every replay has been shown.
      if (potRef.current !== undefined) setBalance(potRef.current);
    } finally {
      draining.current = false;
    }
  }, [playReplay]);

  const replays = shared?.replays;
  useEffect(() => {
    if (!replays) return;
    if (!seenReplays.current) {
      // Anything already in the list on first render happened before we arrived.
      seenReplays.current = new Set(replays.map((r) => r.id));
      return;
    }
    let added = false;
    for (const r of replays) {
      if (seenReplays.current.has(r.id)) continue;
      seenReplays.current.add(r.id);
      replayQueue.current.push(r);
      added = true;
    }
    if (added) void drainReplays();
  }, [replays, drainReplays]);

  // Keep the displayed pot in step with the server whenever nothing is animating.
  const pot = shared?.pot;
  potRef.current = pot;
  useEffect(() => {
    if (pot === undefined) return;
    // While a replay is queued or playing the counter belongs to that replay:
    // syncing now would jump the pot forwards, then backwards on the rewind.
    if (phase === "idle" && !busyRef.current && !draining.current && replayQueue.current.length === 0) {
      setBalance(pot);
    }
  }, [pot, phase]);

  // ─── autoplay ──────────────────────────────────────────────────────────
  const runAutoplay = useCallback(
    async (count: number) => {
      autoRef.current = count;
      setAutoLeft(count);
      while (autoRef.current > 0) {
        const ok = await playRound();
        if (!ok) break;
        autoRef.current -= 1;
        setAutoLeft(autoRef.current);
        if (autoRef.current > 0) await sleep(turboRef.current ? 250 : 650);
      }
      autoRef.current = 0;
      setAutoLeft(0);
    },
    [playRound],
  );

  const stopAutoplay = () => {
    autoRef.current = 0;
    setAutoLeft(0);
  };

  const onSpin = useCallback(() => {
    audio.unlock();
    if (bigWinDoneRef.current) {
      bigWinDoneRef.current();
      return;
    }
    if (bonusAdvanceRef.current) {
      bonusAdvanceRef.current();
      return;
    }
    if (busyRef.current) {
      // Slam-stop: hurry the reels and the count-up.
      skipRef.current = true;
      return;
    }
    audio.click();
    void playRound();
  }, [audio, playRound]);

  // Spacebar spins.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.code !== "Enter") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (paytableOpen) return;
      event.preventDefault();
      if (autoRef.current > 0) return;
      onSpin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSpin, paytableOpen]);

  // Cycle through winning lines while idle.
  useEffect(() => {
    if (phase !== "idle" || lines.length === 0) return;
    let i = -1;
    const timer = window.setInterval(() => {
      i = (i + 1) % (lines.length + 1);
      if (i === lines.length) {
        setLineCursor(-1);
        showPositions(lines.flatMap((l) => l.positions));
        setWinLabel(
          `${lines.length} winning line${lines.length > 1 ? "s" : ""} · win ${formatCredits(
            lines.reduce((s, l) => s + l.payout, 0),
          )}`,
        );
      } else {
        const line = lines[i]!;
        setLineCursor(i);
        showPositions(line.positions);
        setWinLabel(`Line ${line.line} · ${line.count}× ${line.symbol} · ${formatCredits(line.payout)}`);
        audio.lineHighlight(i);
      }
    }, 1300);
    return () => window.clearInterval(timer);
  }, [audio, lines, phase, showPositions]);

  const changeBet = (delta: number) => {
    audio.unlock();
    const next = Math.max(0, Math.min(BET_LEVELS.length - 1, betIndex + delta));
    if (next !== betIndex) {
      setBetIndex(next);
      audio.betChange(delta > 0);
    }
  };

  const toggleMute = () => {
    audio.unlock();
    const next = !muted;
    setMuted(next);
    audio.setMuted(next);
  };

  const toggleMusic = () => {
    audio.unlock();
    const next = !music;
    setMusic(next);
    audio.setMusic(next);
  };

  const busy = phase !== "idle";
  const reelsWidth = cell * REELS + GAP * (REELS - 1);
  const reelsHeight = cell * ROWS;
  const visibleLines =
    lineCursor >= 0 ? lines.slice(lineCursor, lineCursor + 1) : phase === "idle" || phase === "presenting" ? lines : [];

  return (
    <div
      className={`slot-root ${bonus ? "slot-bonus-mode" : ""}`}
      data-phase={phase}
      data-busy={busy ? "true" : "false"}
    >
      <SymbolDefs />
      <div className="storm-sky" aria-hidden>
        <div className="storm-cloud storm-cloud-a" />
        <div className="storm-cloud storm-cloud-b" />
        <div className="storm-cloud storm-cloud-c" />
        <div className="storm-bolt" />
        <div className="temple-silhouette" />
      </div>
      <div key={`flash-${flash}`} className={flash ? "screen-flash" : ""} aria-hidden />

      {/* top bar */}
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href={shared?.backHref ?? "/lobby"} className="slot-pill hover:text-gold-200">
          ← {shared ? "Leave table" : "Lobby"}
        </Link>
        <p className="hidden text-[10px] font-semibold uppercase tracking-luxe text-stone-400 sm:block">
          {shared?.subtitle ?? `${gameName} · 5 reels · 20 lines · demo credits`}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="slot-icon-btn" onClick={() => setPaytableOpen(true)} title="Paytable">
            i
          </button>
          <button type="button" className="slot-icon-btn" onClick={toggleMusic} title="Music">
            {music ? "♫" : <span className="opacity-40">♫</span>}
          </button>
          <button type="button" className="slot-icon-btn" onClick={toggleMute} title="Sound">
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <div className={shared ? "shared-layout" : "contents"}>
      <div className={shared ? "shared-main" : "contents"}>
      {/* stage */}
      <div ref={stageRef} className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-3 pt-6">
        {shared?.banner ? <div className="shared-banner">{shared.banner}</div> : null}
        <div ref={shakeRef}>
          <div className="machine-frame">
            <div className="machine-crest">
              <span className="crest-bolt">⚡</span>
              <span className="crest-text">TEMPLE OF ZEUS</span>
              <span className="crest-bolt">⚡</span>
            </div>
            <div className="machine-inner" style={{ width: reelsWidth + 24, height: reelsHeight + 24 }}>
              <div
                ref={reelsBoxRef}
                className="relative"
                style={{ width: reelsWidth, height: reelsHeight, display: "flex", gap: GAP }}
              >
                {Array.from({ length: REELS }, (_, i) => (
                  <Reel
                    key={i}
                    ref={(r) => {
                      reelRefs.current[i] = r;
                    }}
                    cell={cell}
                    initial={START_GRID[i]!}
                    highlight={highlights[i] ?? new Set()}
                    dim={dim}
                    anticipate={anticipate[i] ?? false}
                  />
                ))}
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={reelsWidth}
                  height={reelsHeight}
                  viewBox={`0 0 ${reelsWidth} ${reelsHeight}`}
                >
                  {visibleLines.map((line) => {
                    const rows = (PAYLINES[line.line - 1] ?? []).slice(0, line.count);
                    const first = rows[0] ?? 0;
                    const pts = [
                      `0,${first * cell + cell / 2}`,
                      ...rows.map((row, reel) => `${reel * (cell + GAP) + cell / 2},${row * cell + cell / 2}`),
                    ].join(" ");
                    return (
                      <g key={line.line} className="payline">
                        <polyline points={pts} stroke="rgba(0,0,0,0.55)" strokeWidth={9} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                        <polyline points={pts} stroke={lineColor(line.line)} strokeOpacity={0.85} strokeWidth={4.5} fill="none" strokeLinejoin="round" strokeLinecap="round" filter="url(#sf-glow)" />
                      </g>
                    );
                  })}
                </svg>
                {phase === "presenting" && winDisplay > 0 && !bigWin ? (
                  <div className="reel-win-amount">{formatCredits(winDisplay)}</div>
                ) : null}
              </div>
            </div>
            <div className="machine-base">
              <span className="win-label">
                {winLabel || (phase === "spinning" ? "Good luck!" : bonus ? "Free spins" : "Zeus pays wild · 3 temples = free spins")}
              </span>
            </div>
          </div>
        </div>

        {/* bonus HUD */}
        {bonus?.stage === "playing" ? (
          <div className="bonus-hud animate-scale-in">
            <span>FREE SPIN {bonus.spinIndex}/{bonus.spinCount}</span>
            <span className="text-gold-200">×{bonus.multiplier}</span>
            <span>BONUS WIN {formatCredits(bonus.total)}</span>
          </div>
        ) : null}
      </div>

      {/* control deck */}
      <div className="relative z-20 pb-14">
        <div className="control-deck">
          <div className="deck-stat">
            <span className="deck-label">{shared?.balanceLabel ?? "Balance"}</span>
            <span className="deck-value">{formatCredits(balance)}</span>
          </div>
          <div className="deck-stat hidden sm:flex">
            <span className="deck-label">Win</span>
            <span key={winDisplay > 0 ? "w" : "z"} className={`deck-value ${winDisplay > 0 ? "text-lucky-400 win-pop" : ""}`}>
              {formatCredits(winDisplay)}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" className="deck-round" onClick={() => changeBet(-1)} disabled={busy || autoLeft > 0} aria-label="Lower bet">
              −
            </button>
            <div className="deck-stat min-w-[64px] items-center">
              <span className="deck-label">Bet</span>
              <span className="deck-value">{bet}</span>
            </div>
            <button type="button" className="deck-round" onClick={() => changeBet(1)} disabled={busy || autoLeft > 0} aria-label="Raise bet">
              +
            </button>
          </div>

          <button
            type="button"
            onClick={autoLeft > 0 ? stopAutoplay : onSpin}
            className={`spin-button ${phase === "spinning" ? "is-busy" : ""} ${autoLeft > 0 ? "is-auto" : ""} ${shared && !shared.canSpin && !busy ? "is-locked" : ""}`}
            aria-label="Spin"
          >
            {autoLeft > 0 ? (
              <span className="flex flex-col items-center leading-none">
                <span className="text-[11px] tracking-wider">STOP</span>
                <span className="text-xl">{autoLeft}</span>
              </span>
            ) : phase === "spinning" ? (
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                <path d="M20 4v5h-5" />
              </svg>
            )}
          </button>

          <div className="relative flex items-center gap-2">
            <button
              type="button"
              className={`deck-toggle ${autoLeft > 0 || autoMenu ? "is-on" : ""}`}
              onClick={() => {
                audio.unlock();
                if (autoLeft > 0) stopAutoplay();
                else setAutoMenu((m) => !m);
              }}
              disabled={busy && autoLeft === 0}
            >
              AUTO
            </button>
            {autoMenu ? (
              <div className="auto-menu animate-scale-in">
                {AUTOPLAY_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="auto-option"
                    onClick={() => {
                      setAutoMenu(false);
                      void runAutoplay(n);
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className={`deck-toggle ${turbo ? "is-on" : ""}`}
              onClick={() => {
                audio.unlock();
                audio.click();
                setTurbo((t) => !t);
              }}
            >
              ⚡ TURBO
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 text-[11px] uppercase tracking-wider text-stone-400 sm:px-6">
          <span>
            {displayName} ·{" "}
            {shared && !shared.canSpin ? (
              <span>{shared.lockedReason ?? "watching"}</span>
            ) : (
              <>
                <span className="hidden sm:inline">space to spin · tap spin again to slam-stop</span>
                <span className="sm:hidden">tap spin again to slam-stop</span>
              </>
            )}
          </span>
          <span className="hidden gap-1 sm:flex">
            {history.slice(0, 8).map((h) => (
              <span key={h.id} className={`history-dot ${h.win > 0 ? (h.win >= h.bet * 10 ? "big" : "win") : ""}`} title={`${h.win}`} />
            ))}
          </span>
        </div>
        {error ? (
          <div className="absolute -top-12 left-1/2 max-w-[90vw] -translate-x-1/2 rounded-full border border-danger/40 bg-ink-900/95 px-4 py-2 text-center text-sm text-danger animate-fade-up">
            {error}
          </div>
        ) : null}
      </div>
      </div>
      {shared ? <aside className="shared-aside">{shared.sidebar}</aside> : null}
      </div>

      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-40 h-full w-full" />

      {/* big win overlay */}
      {bigWin ? (
        <button type="button" className="bigwin-overlay" onClick={onSpin}>
          <div className="bigwin-rays" />
          <div className={`bigwin-title tier-${bigWin.tier.split(" ")[0]!.toLowerCase()}`}>{bigWin.tier}</div>
          <div className="bigwin-amount">{formatCredits(bigWin.amount)}</div>
          <div className="mt-6 text-xs uppercase tracking-luxe text-gold-200/70">tap to continue</div>
        </button>
      ) : null}

      {/* bonus intro/outro */}
      {bonus && bonus.stage !== "playing" ? (
        <button type="button" className="bonus-overlay" onClick={onSpin}>
          <div className="bonus-card animate-scale-in">
            <div className="bonus-bolt">⚡</div>
            {bonus.stage === "intro" ? (
              <>
                <p className="label text-gold-300/80">
                  {bonus.trigger === "team" ? "Zeus Power unleashed" : "3 temples — the gods answer"}
                </p>
                <h2 className="bonus-headline">FREE SPINS</h2>
                <p className="mt-3 font-display text-2xl text-stone-100">
                  {bonus.spinCount} spins · <span className="text-gold-200">×{bonus.multiplier}</span> multiplier
                </p>
                <p className="mt-1 text-sm text-stone-400">{bonus.label}</p>
              </>
            ) : (
              <>
                <p className="label text-gold-300/80">Free spins complete</p>
                <h2 className="bonus-headline">{formatCredits(bonus.total)}</h2>
                <p className="mt-3 text-sm text-stone-400">
                  won across {bonus.spinCount} free spins on the {bonus.label}
                </p>
              </>
            )}
            <p className="mt-6 text-xs uppercase tracking-luxe text-gold-200/60">tap to continue</p>
          </div>
        </button>
      ) : null}

      {paytableOpen ? <Paytable bet={bet} onClose={() => setPaytableOpen(false)} /> : null}
    </div>
  );
}
