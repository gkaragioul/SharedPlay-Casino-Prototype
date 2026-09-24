/**
 * Monte-Carlo return-to-player check for Temple of Zeus.
 *
 *   pnpm sim:rtp [spins]
 *
 * This is how the published RTP is established: the reel weights and paytable
 * are fixed, and PAYOUT_SCALE is the single constant that is calibrated against
 * this simulator. Bonuses (scatter and the cooperative ZEUS POWER round) are
 * included because they run through the same engine.
 */
import { createRng } from "../rng";
import { BET_LEVELS, TEMPLE_MULTIPLAYER, templeOfZeus } from "../temple-of-zeus";

const spins = Number(process.argv[2] ?? 500_000);
const bet = BET_LEVELS[3] ?? 10;

if (!Number.isFinite(spins) || spins <= 0) {
  throw new Error(`Invalid spin count: ${process.argv[2]}`);
}

const rng = createRng({ mode: "seeded", seed: "temple-rtp-sim" });
let state = templeOfZeus.createState({ bet });

let totalBet = 0;
let totalWin = 0;
let winningSpins = 0;
let payingSpins = 0;
let scatterBonuses = 0;
let biggestWin = 0;
let previousScatters = 0;

const started = Date.now();

for (let index = 0; index < spins; index += 1) {
  const placed = templeOfZeus.placeBet(state, bet);
  state = placed.state;

  const resolution = templeOfZeus.resolveRound(state, {
    rng,
    roundId: `sim-${index}`,
    multiplayer: false,
  });
  state = resolution.state;

  totalBet += bet;
  totalWin += resolution.payout;
  if (resolution.payout > 0) winningSpins += 1;
  if (resolution.payout > bet) payingSpins += 1;
  biggestWin = Math.max(biggestWin, resolution.payout);

  if (resolution.state.lastScatters !== previousScatters) {
    previousScatters = resolution.state.lastScatters;
  }
  if (resolution.bonusTriggered) scatterBonuses += 1;
}

const rtp = totalWin / totalBet;
const elapsed = (Date.now() - started) / 1000;
const teamBonuses = (state as { teamBonusCount: number }).teamBonusCount;

const rows: [string, string][] = [
  ["spins", spins.toLocaleString()],
  ["bet per spin", bet.toLocaleString()],
  ["total wagered", totalBet.toLocaleString()],
  ["total returned", totalWin.toLocaleString()],
  ["RTP", `${(rtp * 100).toFixed(3)}%`],
  ["hit frequency (any win)", `${((winningSpins / spins) * 100).toFixed(2)}%`],
  ["spins returning > stake", `${((payingSpins / spins) * 100).toFixed(2)}%`],
  ["scatter bonuses", `${scatterBonuses} (1 in ${Math.round(spins / Math.max(1, scatterBonuses))})`],
  [
    "ZEUS POWER bonuses",
    `${teamBonuses} (1 in ${Math.round(spins / Math.max(1, teamBonuses))})`,
  ],
  ["biggest single win", `${biggestWin.toLocaleString()} (${(biggestWin / bet).toFixed(1)}x)`],
  ["elapsed", `${elapsed.toFixed(2)}s`],
];

console.log("\nTemple of Zeus — RTP simulation");
console.log("─".repeat(46));
for (const [label, value] of rows) {
  console.log(`${label.padEnd(26)} ${value}`);
}
console.log("─".repeat(46));
console.log(
  `Teams unlock ZEUS POWER every ~${Math.round(
    spins / Math.max(1, teamBonuses),
  )} spins (${TEMPLE_MULTIPLAYER.meterPerLightning} bolts per lightning).\n`,
);

const target = 0.955;
const drift = Math.abs(rtp - target);
if (drift > 0.02) {
  console.warn(
    `WARNING: RTP is ${(rtp * 100).toFixed(2)}%, which is more than 2pp from the ${(
      target * 100
    ).toFixed(1)}% target. Adjust PAYOUT_SCALE in temple-of-zeus/paytable.ts.`,
  );
} else {
  console.log(`RTP is within 2pp of the ${(target * 100).toFixed(1)}% prototype target.`);
}
