/**
 * Temple of Zeus symbol set.
 *
 * All artwork is original: the web app renders these ids with generated SVG/CSS
 * glyphs. No third-party casino assets are used anywhere in this project.
 */
export const SYMBOLS = {
  ZEUS: "ZEUS",
  LIGHTNING: "LIGHTNING",
  TEMPLE: "TEMPLE",
  EAGLE: "EAGLE",
  SHIELD: "SHIELD",
  LAUREL: "LAUREL",
  COIN: "COIN",
  ACE: "ACE",
  KING: "KING",
  QUEEN: "QUEEN",
  JACK: "JACK",
} as const;

export type TempleSymbol = (typeof SYMBOLS)[keyof typeof SYMBOLS];

/** Zeus substitutes for every symbol except the scatter. */
export const WILD_SYMBOL: TempleSymbol = SYMBOLS.ZEUS;

/** The temple scatter pays anywhere and triggers the bonus. */
export const SCATTER_SYMBOL: TempleSymbol = SYMBOLS.TEMPLE;

export interface SymbolMeta {
  name: string;
  kind: "wild" | "scatter" | "regular";
  /** Lower is more valuable. Used for decoration only. */
  tier: number;
}

export const SYMBOL_META: Record<TempleSymbol, SymbolMeta> = {
  ZEUS: { name: "Zeus", kind: "wild", tier: 0 },
  LIGHTNING: { name: "Lightning", kind: "regular", tier: 1 },
  TEMPLE: { name: "Temple", kind: "scatter", tier: 2 },
  EAGLE: { name: "Eagle", kind: "regular", tier: 3 },
  SHIELD: { name: "Shield", kind: "regular", tier: 4 },
  LAUREL: { name: "Laurel", kind: "regular", tier: 5 },
  COIN: { name: "Coin", kind: "regular", tier: 6 },
  ACE: { name: "Ace", kind: "regular", tier: 7 },
  KING: { name: "King", kind: "regular", tier: 8 },
  QUEEN: { name: "Queen", kind: "regular", tier: 9 },
  JACK: { name: "Jack", kind: "regular", tier: 10 },
};

export const ALL_SYMBOLS = Object.keys(SYMBOL_META) as TempleSymbol[];

/** Symbols that can appear as the leading symbol of a payline win. */
export const LINE_SYMBOLS = ALL_SYMBOLS.filter(
  (symbol) => SYMBOL_META[symbol].kind !== "scatter",
);
