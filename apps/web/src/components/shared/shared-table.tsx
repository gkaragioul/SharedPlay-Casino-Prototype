"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  REACTION_EMOJIS,
  type Ack,
  type ChatMessageView,
  type ClientToServerEvents,
  type ReactionView,
  type RoundBroadcast,
  type ServerToClientEvents,
  type SessionView,
  type SettlementResult,
  type SpinAck,
  type TempleOfZeusView,
  type VoteView,
} from "@sharedplay/types";
// Import the replay rules by subpath: the browser bundle must not pull in the
// sharedplay barrel, which reaches node:crypto through the ledger.
import { roundPotFrames } from "@sharedplay/sharedplay/replay";
import { formatCredits, formatPercentFromBp, formatSignedCredits } from "@/lib/format";
import {
  SlotMachine,
  countScatters,
  type SlotReplay,
  type SpinOutcome,
} from "@/components/slot/slot-machine";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const PLAYER_COLORS = ["#f5c542", "#5fd4a0", "#6fb6ff", "#f08ad0", "#ff9a4d", "#b89cff", "#7fe3e0", "#ff6b6b"];

function templeView(view: SessionView | null): TempleOfZeusView | null {
  const g = view?.gameState;
  return g && g.game === "temple-of-zeus" ? g : null;
}

/**
 * The shared-money table: one pot funded by everyone, the full slot machine in
 * the middle, and the pot / ownership / control / votes panel beside it.
 * The server decides every number; this component only animates what it sends.
 */
export function SharedTable({
  sessionId,
  userId,
  displayName,
  initialView,
}: {
  sessionId: string;
  userId: string;
  displayName: string;
  initialView: SessionView;
}) {
  const router = useRouter();
  const socketRef = useRef<ClientSocket | null>(null);
  const [view, setView] = useState<SessionView>(initialView);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [connected, setConnected] = useState(false);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [replays, setReplays] = useState<SlotReplay[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [floaters, setFloaters] = useState<{ id: string; emoji: string; name: string; x: number }[]>([]);
  const [potPulse, setPotPulse] = useState<"up" | "down" | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);

  const rounds = useRef(new Map<string, RoundBroadcast>());

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 3200);
  }, []);

  const applyView = useCallback((next: SessionView) => {
    const prev = viewRef.current;
    if (prev && next.currentBankroll !== prev.currentBankroll) {
      setPotPulse(next.currentBankroll > prev.currentBankroll ? "up" : "down");
      window.setTimeout(() => setPotPulse(null), 700);
    }
    viewRef.current = next;
    setView(next);
  }, []);

  // ─── socket ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket: ClientSocket = io({ withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("session:join", { sessionId }, (ack: Ack<SessionView>) => {
        if (ack.ok && ack.data) applyView(ack.data);
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("session:state", applyView);
    socket.on("game:round", (round) => {
      rounds.current.set(round.roundId, round);
      if (round.userId === userId) return; // our own spin animates from the ack
      const byName =
        viewRef.current.participants.find((p) => p.id === round.userId)?.displayName ?? "A player";
      // The round carries its own pot numbers (sharedplay's roundPotFrames keeps
      // them in one place), so the replay is correct even when the new session
      // state arrived first.
      const frames = roundPotFrames(round.bankrollBefore, round.bankrollAfter);
      setReplays((list) => [
        ...list.slice(-30),
        {
          id: round.roundId,
          kind: "round",
          bet: round.bet,
          bankrollBefore: frames.start,
          bankroll: frames.end,
          byName,
          outcome: {
            bankroll: frames.end,
            payout: round.payout,
            reels: round.reelStops,
            lines: round.winningLines,
            scatters: countScatters(round.reelStops),
            bonus: null,
          },
        },
      ]);
    });
    // Group free spins: sent before the new session state, so the replay rewinds
    // the pot and counts it back up instead of jumping.
    socket.on("game:bonus", (bonus) => {
      const frames = roundPotFrames(bonus.bankrollBefore, bonus.bankrollAfter);
      setReplays((list) => [
        ...list.slice(-30),
        {
          id: `bonus:${bonus.roundId ?? bonus.result.path}`,
          kind: "bonus",
          bet: bonus.bet,
          bankrollBefore: frames.start,
          bankroll: frames.end,
          result: bonus.result,
        },
      ]);
    });
    socket.on("chat:message", (message) => {
      // Chat travels as its own event, so merge it into the view we render from.
      setView((current) =>
        current.chat.some((m) => m.id === message.id)
          ? current
          : { ...current, chat: [...current.chat, message] },
      );
    });
    socket.on("session:settled", (payload) => setSettlement(payload));
    socket.on("control:changed", (payload) => {
      if (payload.currentControllerId === userId) flash("You're in control — spin!");
    });
    socket.on("reaction", (r: ReactionView) => {
      const id = r.id;
      setFloaters((f) => [...f, { id, emoji: r.emoji, name: r.displayName, x: 10 + Math.random() * 80 }]);
      window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2600);
    });
    socket.on("error", (e) => flash(e.message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyView, flash, sessionId, userId]);

  const emit = useCallback(
    <T,>(event: keyof ClientToServerEvents, payload: unknown): Promise<T> =>
      new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket) return reject(new Error("Not connected."));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (socket.emit as any)(event, payload, (ack: Ack<T>) => {
          if (ack.ok) resolve(ack.data as T);
          else reject(new Error(ack.error ?? "That didn't work."));
        });
      }),
    [],
  );

  const act = useCallback(
    async (event: keyof ClientToServerEvents, payload: unknown) => {
      try {
        return await emit<unknown>(event, payload);
      } catch (e) {
        flash(e instanceof Error ? e.message : "That didn't work.");
        return null;
      }
    },
    [emit, flash],
  );

  const requestSpin = useCallback(
    async (bet: number): Promise<SpinOutcome> => {
      const ack = await emit<SpinAck>("game:spin", { sessionId, bet });
      // The round broadcast reaches us before the ack; wait briefly just in case.
      let round = rounds.current.get(ack.roundId);
      for (let i = 0; !round && i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
        round = rounds.current.get(ack.roundId);
      }
      const reels = round?.reelStops ?? templeView(viewRef.current)?.reels ?? [];
      return {
        bankroll: ack.bankroll,
        payout: ack.payout,
        reels,
        lines: round?.winningLines ?? [],
        scatters: countScatters(reels),
        // Shared bonuses go to a group vote first, then replay for everyone.
        bonus: null,
      };
    },
    [emit, sessionId],
  );

  // ─── derived ───────────────────────────────────────────────────────────
  const me = view.participants.find((p) => p.id === userId) ?? null;
  const isHost = view.hostId === userId;
  const isController = view.currentControllerId === userId;
  const controller = view.participants.find((p) => p.id === view.currentControllerId) ?? null;
  const openVote = view.openVote;
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    view.participants.forEach((p, i) => map.set(p.id, PLAYER_COLORS[i % PLAYER_COLORS.length]!));
    return (id: string) => map.get(id) ?? "#999";
  }, [view.participants]);
  const spinsLeft = view.controlRotationEvery - (view.spinCount % view.controlRotationEvery);

  const lockedReason = !connected
    ? "Reconnecting…"
    : openVote
      ? "Vote in progress — cast your vote first"
      : !isController
        ? `${controller?.displayName ?? "Another player"} is spinning — you're watching`
        : null;

  // ─── screens ───────────────────────────────────────────────────────────
  if (view.status === "LOBBY") {
    return (
      <TableLobby
        view={view}
        userId={userId}
        isHost={isHost}
        colorOf={colorOf}
        connected={connected}
        onStart={() => act("session:start", { sessionId })}
        onCancel={() => act("session:leave", { sessionId }).then(() => router.push("/lobby"))}
        notice={notice}
      />
    );
  }

  const sidebar = (
    <div className="space-y-3">
      {/* pot */}
      <div className={`st-card st-pot ${potPulse ? `pulse-${potPulse}` : ""}`}>
        <div className="flex items-center justify-between">
          <p className="st-label">Shared pot</p>
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-stone-500">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-lucky-500" : "bg-danger"}`} />
            {connected ? "live" : "offline"}
          </span>
        </div>
        <p className="st-pot-value">{formatCredits(view.currentBankroll)}</p>
        <p className={`text-xs font-semibold ${view.profit >= 0 ? "text-lucky-400" : "text-danger"}`}>
          {formatSignedCredits(view.profit)} since start · started {formatCredits(view.initialBankroll)}
        </p>
        <div className="st-stack mt-3" aria-hidden>
          {view.participants.map((p) => (
            <span key={p.id} style={{ width: `${p.ownershipBp / 100}%`, background: colorOf(p.id) }} />
          ))}
        </div>
      </div>

      {/* players */}
      <div className="st-card">
        <p className="st-label">Who owns the pot</p>
        <ul className="mt-2 space-y-1.5">
          {view.participants.map((p) => {
            const worth = Math.floor((view.currentBankroll * p.ownershipBp) / 10_000);
            const diff = worth - p.contribution;
            return (
              <li key={p.id} className={`st-player ${p.isController ? "is-control" : ""}`}>
                <span className="st-avatar" style={{ borderColor: colorOf(p.id) }}>
                  {p.avatar ?? p.displayName.slice(0, 1)}
                  <i className={p.online ? "on" : ""} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-100">
                    {p.displayName}
                    {p.id === userId ? <span className="font-normal text-stone-500"> (you)</span> : null}
                  </span>
                  <span className="block text-[11px] text-stone-500">
                    put in {formatCredits(p.contribution)} · owns {formatPercentFromBp(p.ownershipBp)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-bold text-stone-100">{formatCredits(worth)}</span>
                  <span className={`block text-[11px] ${diff >= 0 ? "text-lucky-400" : "text-danger"}`}>
                    {formatSignedCredits(diff)}
                  </span>
                </span>
                {p.isController ? <span className="st-control-badge">spinning</span> : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] leading-snug text-stone-500">
          Each share of the pot matches what that player put in. Wins and losses are split the same way.
        </p>
      </div>

      {/* control */}
      <div className="st-card">
        <p className="st-label">Turn</p>
        <p className="mt-1 text-sm text-stone-300">
          {isController ? (
            <span className="font-semibold text-gold-200">Your turn to spin</span>
          ) : (
            <>
              <span className="font-semibold text-stone-100">{controller?.displayName ?? "—"}</span> is spinning
            </>
          )}
          <span className="text-stone-500"> · passes on in {spinsLeft} spin{spinsLeft === 1 ? "" : "s"}</span>
        </p>
        {isController && view.controlRequests.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {view.controlRequests.map((r) => (
              <button
                key={r.byUserId}
                type="button"
                className="st-btn w-full"
                onClick={() => act("control:pass", { sessionId, toUserId: r.byUserId })}
              >
                {r.byName} wants a turn — hand over
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex gap-2">
          {isController ? (
            <button type="button" className="st-btn flex-1" onClick={() => act("control:pass", { sessionId })}>
              Pass turn
            </button>
          ) : (
            <button type="button" className="st-btn flex-1" onClick={() => act("control:request", { sessionId })}>
              Ask for a turn
            </button>
          )}
        </div>
      </div>

      {/* vote */}
      {openVote ? <VoteCard vote={openVote} userId={userId} onCast={(c) => act("vote:cast", { sessionId, voteId: openVote.id, choice: c })} /> : null}

      {/* cash out */}
      <div className="st-card">
        <p className="st-label">Cash out</p>
        <p className="mt-1 text-[11px] leading-snug text-stone-500">
          Ends the table and pays everyone their share of the pot back to their wallet.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="st-btn flex-1"
            disabled={!!openVote}
            onClick={() => act("vote:create", { sessionId, type: "CASH_OUT" })}
          >
            Ask everyone
          </button>
          {isHost ? (
            <button
              type="button"
              className="st-btn st-btn-danger flex-1"
              onClick={() => {
                if (window.confirm("End the table now and pay everyone out?")) void act("session:close", { sessionId });
              }}
            >
              End now
            </button>
          ) : null}
        </div>
      </div>

      {/* chat + feed */}
      <ChatCard
        chat={view.chat}
        activity={view.activity}
        onSend={(body) => act("chat:send", { sessionId, body })}
        onReact={(emoji) => act("reaction:send", { sessionId, emoji })}
        colorOf={colorOf}
      />
    </div>
  );

  return (
    <>
      <SlotMachine
        gameName={view.game.name}
        startBalance={view.currentBankroll}
        displayName={displayName}
        shared={{
          balanceLabel: "Shared pot",
          pot: view.currentBankroll,
          canSpin: !lockedReason && view.status === "ACTIVE",
          lockedReason,
          requestSpin,
          replays,
          sidebar,
          subtitle: `Shared table ${view.code} · ${view.participants.length} players`,
          backHref: "/sessions",
          onReplayStart: (r) => {
            setNowPlaying(r.kind === "round" ? `${r.byName} spins ${r.bet}` : "Group free spins!");
            window.setTimeout(() => setNowPlaying(null), 2200);
          },
          banner: (
            <div className="st-banner">
              {nowPlaying ? (
                <span className="text-gold-200">{nowPlaying}</span>
              ) : isController ? (
                <span className="text-gold-200">Your turn · you're betting from the shared pot</span>
              ) : (
                <span>
                  <b style={{ color: controller ? colorOf(controller.id) : undefined }}>{controller?.displayName ?? "—"}</b>{" "}
                  is spinning for the table
                </span>
              )}
              {me ? (
                <span className="text-stone-400">
                  · your share {formatCredits(Math.floor((view.currentBankroll * me.ownershipBp) / 10_000))}
                </span>
              ) : null}
              {notice ? <span className="st-notice">{notice}</span> : null}
            </div>
          ),
        }}
      />

      {/* reactions floating up */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {floaters.map((f) => (
          <span key={f.id} className="st-floater" style={{ left: `${f.x}%` }}>
            {f.emoji}
            <small>{f.name}</small>
          </span>
        ))}
      </div>

      {settlement || view.status === "CLOSED" ? (
        <SettlementOverlay settlement={settlement} view={view} userId={userId} colorOf={colorOf} />
      ) : null}
    </>
  );
}

/* ─── pieces ─────────────────────────────────────────────────────────────── */

function VoteCard({ vote, userId, onCast }: { vote: VoteView; userId: string; onCast: (c: string) => void }) {
  const mine = vote.responses.find((r) => r.userId === userId)?.choice;
  const isBonus = vote.type === "BONUS_OPTION";
  const options = isBonus
    ? ((vote.payload?.options as { id: string; label?: string; spins?: number; multiplier?: number }[]) ?? [])
    : [
        { id: "YES", label: "Yes" },
        { id: "NO", label: "No" },
      ];
  const title =
    vote.type === "CASH_OUT"
      ? `${vote.createdByName} wants to cash out`
      : vote.type === "LARGE_BET"
        ? `${vote.createdByName} wants to bet ${String(vote.payload?.bet ?? "?")}`
        : vote.type === "BONUS_OPTION"
          ? "Free spins! Pick the path together"
          : "Vote";
  return (
    <div className="st-card st-vote">
      <p className="st-label text-gold-300">Group vote · {vote.rule === "UNANIMOUS" ? "everyone must agree" : "majority wins"}</p>
      <p className="mt-1 font-display text-base font-semibold text-stone-100">{title}</p>
      <div className={`mt-2 grid gap-2 ${isBonus ? "grid-cols-1" : "grid-cols-2"}`}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onCast(o.id)}
            className={`st-btn ${mine === o.id ? "is-picked" : ""}`}
          >
            {o.label ?? o.id}
            {isBonus && o.spins ? (
              <span className="ml-1 text-stone-400">
                · {o.spins} spins ×{o.multiplier}
              </span>
            ) : null}
            {vote.tally.byChoice[o.id] ? <span className="st-count">{vote.tally.byChoice[o.id]}</span> : null}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        {vote.tally.total} of {vote.tally.eligible} voted
        {vote.responses.length > 0 ? ` · ${vote.responses.map((r) => r.displayName).join(", ")}` : ""}
      </p>
    </div>
  );
}

function ChatCard({
  chat,
  activity,
  onSend,
  onReact,
  colorOf,
}: {
  chat: ChatMessageView[];
  activity: SessionView["activity"];
  onSend: (body: string) => void;
  onReact: (emoji: string) => void;
  colorOf: (id: string) => string;
}) {
  const [text, setText] = useState("");
  const [tab, setTab] = useState<"chat" | "feed">("feed");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length, activity.length, tab]);
  const feed = [...activity].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-30);
  return (
    <div className="st-card">
      <div className="flex gap-1">
        {(["feed", "chat"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`st-tab ${tab === t ? "is-on" : ""}`}>
            {t === "feed" ? "Table feed" : `Chat${chat.length ? ` (${chat.length})` : ""}`}
          </button>
        ))}
      </div>
      <div ref={listRef} className="st-feed">
        {tab === "feed"
          ? feed.map((a) => (
              <p key={a.id} className={a.type === "WIN" || a.type === "BONUS" ? "text-lucky-400" : ""}>
                {a.message}
              </p>
            ))
          : chat.map((m) => (
              <p key={m.id}>
                <b style={{ color: colorOf(m.userId) }}>{m.displayName}</b> {m.body}
              </p>
            ))}
        {tab === "chat" && chat.length === 0 ? <p className="text-stone-600">Say hi to the table.</p> : null}
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          onSend(body);
          setText("");
          setTab("chat");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="Message the table…"
          className="st-input"
        />
        <button type="submit" className="st-btn px-3">
          Send
        </button>
      </form>
      <div className="mt-2 flex justify-between">
        {REACTION_EMOJIS.map((e) => (
          <button key={e} type="button" className="st-emoji" onClick={() => onReact(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function TableLobby({
  view,
  userId,
  isHost,
  colorOf,
  connected,
  onStart,
  onCancel,
  notice,
}: {
  view: SessionView;
  userId: string;
  isHost: boolean;
  colorOf: (id: string) => string;
  connected: boolean;
  onStart: () => void;
  onCancel: () => void;
  notice: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  // Read the origin after mount: rendering it during SSR would leave the button's
  // disabled state different from the client's first render (hydration mismatch).
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const inviteUrl = origin && view.inviteToken ? `${origin}/invite/${view.inviteToken}` : "";
  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy this:", value);
    }
  };
  const host = view.participants.find((p) => p.id === view.hostId);
  return (
    <div className="st-lobby">
      <div className="st-lobby-card">
        <Link href="/sessions" className="text-xs text-stone-500 hover:text-gold-300">
          ← My tables
        </Link>
        <p className="st-label mt-4 text-gold-400">Shared table · {view.game.name}</p>
        <h1 className="mt-1 font-display text-3xl font-black text-stone-100">Building the pot</h1>
        <p className="mt-1 text-sm text-stone-400">
          Everyone chips in credits. The pot plays as one bankroll, and each player owns a slice matching what they put in.
        </p>

        <div className="st-pot-big">
          <span className="st-label">Pot so far</span>
          <span className="st-pot-value">{formatCredits(view.currentBankroll)}</span>
          <div className="st-stack" aria-hidden>
            {view.participants.map((p) => (
              <span key={p.id} style={{ width: `${p.ownershipBp / 100}%`, background: colorOf(p.id) }} />
            ))}
          </div>
        </div>

        <ul className="mt-4 space-y-1.5">
          {view.participants.map((p) => (
            <li key={p.id} className="st-player">
              <span className="st-avatar" style={{ borderColor: colorOf(p.id) }}>
                {p.avatar ?? p.displayName.slice(0, 1)}
                <i className={p.online ? "on" : ""} />
              </span>
              <span className="flex-1 text-sm font-semibold text-stone-100">
                {p.displayName}
                {p.id === userId ? <span className="font-normal text-stone-500"> (you)</span> : null}
                {p.id === view.hostId ? <span className="ml-1 text-[10px] uppercase text-gold-400">host</span> : null}
              </span>
              <span className="text-sm text-stone-300">{formatCredits(p.contribution)}</span>
              <span className="w-14 text-right text-sm font-bold" style={{ color: colorOf(p.id) }}>
                {formatPercentFromBp(p.ownershipBp)}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, Math.min(3, view.maxParticipants - view.participants.length)) }, (_, i) => (
            <li key={`empty-${i}`} className="st-player st-empty">
              <span className="st-avatar">+</span>
              <span className="text-sm text-stone-600">Empty seat</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" className="st-btn" onClick={() => copy("link", inviteUrl)} disabled={!inviteUrl}>
            {copied === "link" ? "Invite link copied ✓" : "Copy invite link"}
          </button>
          <button type="button" className="st-btn" onClick={() => copy("code", view.code)}>
            {copied === "code" ? "Code copied ✓" : (
              <>
                Table code <b className="ml-1 font-mono tracking-[0.25em] text-gold-300">{view.code}</b>
              </>
            )}
          </button>
        </div>

        {isHost ? (
          <button
            type="button"
            className="btn-gold mt-3 w-full py-3 text-sm"
            onClick={onStart}
            disabled={view.participants.length < 2 || !connected}
          >
            {view.participants.length < 2 ? "Waiting for at least one friend to join…" : `Start the table · pot ${formatCredits(view.currentBankroll)}`}
          </button>
        ) : (
          <p className="mt-4 rounded-xl border border-gold-500/20 bg-gold-500/[0.06] p-3 text-center text-sm text-gold-100">
            Waiting for {host?.displayName ?? "the host"} to start the table…
          </p>
        )}
        {isHost ? (
          <button type="button" className="mt-2 w-full text-xs text-stone-500 hover:text-danger" onClick={onCancel}>
            Cancel table and refund everyone
          </button>
        ) : null}
        {notice ? <p className="mt-3 text-center text-sm text-danger">{notice}</p> : null}
        <p className="mt-4 text-center text-[11px] text-stone-600">Demo credits only · no real money</p>
      </div>
    </div>
  );
}

function SettlementOverlay({
  settlement,
  view,
  userId,
  colorOf,
}: {
  settlement: SettlementResult | null;
  view: SessionView;
  userId: string;
  colorOf: (id: string) => string;
}) {
  const shares =
    settlement?.shares ??
    view.participants.map((p) => ({
      userId: p.id,
      displayName: p.displayName,
      contribution: p.contribution,
      ownershipBp: p.ownershipBp,
      share: p.finalSettlement ?? 0,
      profit: (p.finalSettlement ?? 0) - p.contribution,
    }));
  const finalPot = settlement?.finalBankroll ?? view.currentBankroll;
  const profit = settlement?.profit ?? view.profit;
  const mine = shares.find((s) => s.userId === userId);
  return (
    <div className="st-settle">
      <div className="st-settle-card animate-scale-in">
        <p className="st-label text-gold-400">Table closed · paid out</p>
        <h2 className="mt-1 font-display text-4xl font-black text-stone-100">{formatCredits(finalPot)}</h2>
        <p className={`text-sm font-semibold ${profit >= 0 ? "text-lucky-400" : "text-danger"}`}>
          final pot · {formatSignedCredits(profit)} vs. start
        </p>
        <ul className="mt-5 space-y-2 text-left">
          {shares.map((s) => (
            <li key={s.userId} className="st-player">
              <span className="st-avatar" style={{ borderColor: colorOf(s.userId) }}>
                {s.displayName.slice(0, 1)}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-stone-100">{s.displayName}</span>
                <span className="block text-[11px] text-stone-500">
                  put in {formatCredits(s.contribution)} · owned {formatPercentFromBp(s.ownershipBp)}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-base font-bold text-stone-100">{formatCredits(s.share)}</span>
                <span className={`block text-[11px] ${s.profit >= 0 ? "text-lucky-400" : "text-danger"}`}>
                  {formatSignedCredits(s.profit)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {mine ? (
          <p className="mt-4 text-sm text-stone-300">
            <b className="text-gold-200">{formatCredits(mine.share)}</b> went back to your wallet.
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link href="/sessions/new" className="btn-gold py-2.5 text-sm">
            New table
          </Link>
          <Link href="/lobby" className="st-btn py-2.5 text-center text-sm">
            Back to lobby
          </Link>
        </div>
      </div>
    </div>
  );
}
