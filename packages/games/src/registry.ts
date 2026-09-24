import type { GameEngine } from "./engine";
import { TEMPLE_SLUG, templeOfZeus } from "./temple-of-zeus";

/**
 * Games are registered by slug. SharedPlay never imports a specific engine, so
 * adding a game (Roulette, Blackjack) is a one-line change here.
 */
export type AnyGameEngine = GameEngine<unknown, unknown>;

export const GAME_ENGINES: Record<string, AnyGameEngine> = {
  [TEMPLE_SLUG]: templeOfZeus,
};

export function getGameEngine(slug: string): AnyGameEngine | null {
  return GAME_ENGINES[slug] ?? null;
}

export function listGameSlugs(): string[] {
  return Object.keys(GAME_ENGINES);
}
