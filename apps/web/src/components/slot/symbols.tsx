/**
 * Temple of Zeus symbol artwork.
 *
 * Every glyph is original vector art drawn here (no third-party casino assets).
 * Gradients and filters live once in <SymbolDefs/>, which must be mounted on any
 * page that renders symbols; the glyphs reference them by id.
 */
import { memo, type ReactElement } from "react";

export function SymbolDefs() {
  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <linearGradient id="sg-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset="0.35" stopColor="#f3c84e" />
          <stop offset="0.7" stopColor="#b07a1c" />
          <stop offset="1" stopColor="#ffe28c" />
        </linearGradient>
        <linearGradient id="sg-gold-h" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#e3b240" />
          <stop offset="1" stopColor="#8a5b12" />
        </linearGradient>
        <radialGradient id="sg-purple" cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#9d6cf0" />
          <stop offset="0.6" stopColor="#4a1f9a" />
          <stop offset="1" stopColor="#1d0b45" />
        </radialGradient>
        <radialGradient id="sg-storm" cx="0.5" cy="0.4" r="0.65">
          <stop offset="0" stopColor="#6fd8ff" />
          <stop offset="0.55" stopColor="#1f5fd6" />
          <stop offset="1" stopColor="#081a4a" />
        </radialGradient>
        <linearGradient id="sg-marble" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9cfdd" />
        </linearGradient>
        <radialGradient id="sg-bronze" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#f7c07a" />
          <stop offset="0.55" stopColor="#b3692a" />
          <stop offset="1" stopColor="#5a2f0e" />
        </radialGradient>
        <linearGradient id="sg-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7a7a" />
          <stop offset="1" stopColor="#a50e24" />
        </linearGradient>
        <linearGradient id="sg-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8f7a8" />
          <stop offset="0.5" stopColor="#3aa94a" />
          <stop offset="1" stopColor="#135a20" />
        </linearGradient>
        <linearGradient id="sg-card-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a9a" />
          <stop offset="0.5" stopColor="#e0192f" />
          <stop offset="1" stopColor="#6d0616" />
        </linearGradient>
        <linearGradient id="sg-card-k" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9d3ff" />
          <stop offset="0.5" stopColor="#2f6fe6" />
          <stop offset="1" stopColor="#0c2a74" />
        </linearGradient>
        <linearGradient id="sg-card-q" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b3f8cc" />
          <stop offset="0.5" stopColor="#1fb15d" />
          <stop offset="1" stopColor="#0a5329" />
        </linearGradient>
        <linearGradient id="sg-card-j" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe0a8" />
          <stop offset="0.5" stopColor="#f38d1d" />
          <stop offset="1" stopColor="#7e3b05" />
        </linearGradient>
        <radialGradient id="sg-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe9a0" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffe9a0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sg-aura-blue" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8fe3ff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#8fe3ff" stopOpacity="0" />
        </radialGradient>
        <filter id="sf-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="sf-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
        </filter>
        {/* Vertical-only blur for spinning reel strips. */}
        <filter id="vblur" x="0" y="-5%" width="100%" height="110%">
          <feGaussianBlur stdDeviation="0 7" />
        </filter>
      </defs>
    </svg>
  );
}

function Letter({ ch, grad }: { ch: string; grad: string }) {
  return (
    <g filter="url(#sf-shadow)">
      <text
        x="50"
        y="73"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight={900}
        fontSize="66"
        fill="none"
        stroke="url(#sg-gold)"
        strokeWidth="8"
        strokeLinejoin="round"
      >
        {ch}
      </text>
      <text
        x="50"
        y="73"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight={900}
        fontSize="66"
        fill={`url(#${grad})`}
        stroke="#2a1603"
        strokeWidth="1.6"
      >
        {ch}
      </text>
      <path d="M26 84 Q50 90 74 84" stroke="url(#sg-gold)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="87.5" r="2.6" fill="url(#sg-gold)" />
    </g>
  );
}

function Zeus() {
  return (
    <g filter="url(#sf-shadow)">
      <circle cx="50" cy="48" r="44" fill="url(#sg-purple)" stroke="url(#sg-gold)" strokeWidth="4" />
      <circle cx="50" cy="48" r="38" fill="none" stroke="#f3c84e" strokeOpacity="0.35" strokeDasharray="2 4" />
      {/* hair */}
      <path d="M29 46 Q26 22 50 20 Q74 22 71 46 Q64 33 50 33 Q36 33 29 46 Z" fill="#f4f5fb" stroke="#bfc3d6" strokeWidth="1" />
      {/* face */}
      <ellipse cx="50" cy="46" rx="14" ry="15" fill="#f0c6a0" />
      {/* beard */}
      <path
        d="M31 47 Q29 76 50 86 Q71 76 69 47 Q63 60 50 59 Q37 60 31 47 Z"
        fill="#f4f5fb"
        stroke="#bfc3d6"
        strokeWidth="1"
      />
      <path d="M40 66 Q42 76 50 80 M60 66 Q58 76 50 80 M50 62 L50 80" stroke="#c8cbdc" strokeWidth="1.2" fill="none" />
      {/* moustache */}
      <path d="M39 56 Q45 51 50 55 Q55 51 61 56 Q55 58 50 57 Q45 58 39 56 Z" fill="#ffffff" stroke="#bfc3d6" strokeWidth="0.8" />
      {/* brows + glowing eyes */}
      <path d="M39 40 Q44 36 48 40 M52 40 Q56 36 61 40" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" />
      <g filter="url(#sf-glow)">
        <ellipse cx="44" cy="44.5" rx="2.4" ry="1.7" fill="#1b2a4a" />
        <ellipse cx="56" cy="44.5" rx="2.4" ry="1.7" fill="#1b2a4a" />
        <circle cx="44.8" cy="43.9" r="0.7" fill="#8ff0ff" />
        <circle cx="56.8" cy="43.9" r="0.7" fill="#8ff0ff" />
      </g>
      {/* crown */}
      <path d="M33 28 L37 16 L43 25 L50 12 L57 25 L63 16 L67 28 Q50 23 33 28 Z" fill="url(#sg-gold)" stroke="#7a4f0c" strokeWidth="1" />
      <circle cx="50" cy="19" r="2.2" fill="#e0192f" />
      {/* WILD banner */}
      <rect x="21" y="79" width="58" height="16" rx="5" fill="url(#sg-gold)" stroke="#6b430a" strokeWidth="1.4" />
      <text x="50" y="91.5" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={900} fontSize="12.5" fill="#3b1470" letterSpacing="1.5">
        WILD
      </text>
    </g>
  );
}

function Lightning() {
  return (
    <g>
      <circle cx="50" cy="50" r="42" fill="url(#sg-storm)" stroke="#9fe6ff" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="50" cy="50" r="40" fill="url(#sg-aura-blue)" opacity="0.5" />
      <g filter="url(#sf-glow)">
        <path
          d="M60 6 L27 55 L46 55 L37 94 L76 39 L56 39 L68 6 Z"
          fill="#fffbd0"
          stroke="#ffd21f"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </g>
      <path d="M58 14 L38 48 L50 48" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.8" />
    </g>
  );
}

function Temple() {
  return (
    <g filter="url(#sf-shadow)">
      <circle cx="50" cy="48" r="46" fill="url(#sg-aura)" />
      <path d="M12 33 L50 11 L88 33 Z" fill="url(#sg-marble)" stroke="url(#sg-gold)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="50" cy="26" r="4" fill="url(#sg-gold)" />
      <rect x="14" y="33" width="72" height="7" fill="url(#sg-gold)" stroke="#6b430a" strokeWidth="0.8" />
      {[20, 35, 50, 65, 80].map((cx) => (
        <g key={cx}>
          <rect x={cx - 4} y="40" width="8" height="33" fill="url(#sg-marble)" stroke="#9aa3b8" strokeWidth="0.8" />
          <path d={`M${cx - 1.5} 42 V71 M${cx + 1.5} 42 V71`} stroke="#b7bfd0" strokeWidth="0.7" />
        </g>
      ))}
      <rect x="10" y="73" width="80" height="5" fill="url(#sg-marble)" stroke="#9aa3b8" strokeWidth="0.8" />
      <rect x="6" y="78" width="88" height="5" fill="url(#sg-marble)" stroke="#9aa3b8" strokeWidth="0.8" />
      <rect x="15" y="85" width="70" height="13" rx="4" fill="url(#sg-red)" stroke="url(#sg-gold)" strokeWidth="1.6" />
      <text x="50" y="95" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={900} fontSize="9.5" fill="#fff6cf" letterSpacing="1.4">
        SCATTER
      </text>
    </g>
  );
}

function Eagle() {
  return (
    <g filter="url(#sf-shadow)">
      <circle cx="50" cy="50" r="44" fill="url(#sg-storm)" stroke="url(#sg-gold)" strokeWidth="3.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#9fe6ff" strokeOpacity="0.25" strokeDasharray="2 4" />
      <path
        d="M50 46 C40 34 25 24 6 27 C16 33 19 37 12 41 C22 43 24 47 17 52 C28 53 35 56 43 62 Z"
        fill="url(#sg-gold-h)"
        stroke="#5b3b08"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M50 46 C60 34 75 24 94 27 C84 33 81 37 88 41 C78 43 76 47 83 52 C72 53 65 56 57 62 Z"
        fill="url(#sg-gold-h)"
        stroke="#5b3b08"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M20 33 L42 48 M18 44 L42 53 M80 33 L58 48 M82 44 L58 53" stroke="#7a520e" strokeWidth="1" />
      <path d="M43 66 L50 88 L57 66 Z" fill="url(#sg-gold)" stroke="#5b3b08" strokeWidth="1.2" />
      <ellipse cx="50" cy="55" rx="9.5" ry="15" fill="url(#sg-gold)" stroke="#5b3b08" strokeWidth="1.2" />
      <circle cx="50" cy="33" r="8" fill="#fbf6ea" stroke="#5b3b08" strokeWidth="1.2" />
      <path d="M52 34 L61 37 L53 41 Z" fill="#f59e0b" stroke="#5b3b08" strokeWidth="0.8" />
      <circle cx="51.5" cy="31.5" r="1.5" fill="#1a1204" />
    </g>
  );
}

function Shield() {
  const star = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 === 0 ? 17 : 7;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <g filter="url(#sf-shadow)">
      <circle cx="50" cy="50" r="41" fill="url(#sg-bronze)" stroke="#3d2208" strokeWidth="3" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="url(#sg-gold)" strokeWidth="3.5" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (Math.PI / 6) * i;
        // Rounded so server and client render identical attribute strings.
        const cx = (50 + 37.5 * Math.cos(a)).toFixed(2);
        const cy = (50 + 37.5 * Math.sin(a)).toFixed(2);
        return <circle key={i} cx={cx} cy={cy} r="1.6" fill="#ffe08a" />;
      })}
      <circle cx="50" cy="50" r="25" fill="url(#sg-red)" stroke="#3d0710" strokeWidth="1.2" />
      <polygon points={star} fill="url(#sg-gold)" stroke="#6b430a" strokeWidth="0.8" />
      <ellipse cx="40" cy="36" rx="12" ry="5" fill="#fff" opacity="0.18" transform="rotate(-30 40 36)" />
    </g>
  );
}

function Laurel() {
  const leaves: { x: number; y: number; rot: number }[] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k += 1) {
      const t = k / 6;
      const deg = side < 0 ? 115 + t * 140 : 65 - t * 140;
      const a = (deg * Math.PI) / 180;
      leaves.push({
        x: 50 + 31 * Math.cos(a),
        y: 50 + 31 * Math.sin(a),
        rot: deg + (side < 0 ? 60 : -60),
      });
    }
  }
  return (
    <g filter="url(#sf-shadow)">
      <path d="M36 80 A31 31 0 0 1 32 22 M64 80 A31 31 0 0 0 68 22" stroke="#6b4a12" strokeWidth="2.5" fill="none" />
      {leaves.map((leaf, index) => (
        <ellipse
          key={index}
          cx={leaf.x}
          cy={leaf.y}
          rx="10"
          ry="4.4"
          fill="url(#sg-green)"
          stroke="#0f4219"
          strokeWidth="0.8"
          transform={`rotate(${leaf.rot} ${leaf.x} ${leaf.y})`}
        />
      ))}
      <path d="M38 78 L50 86 L62 78 L58 92 L50 86 L42 92 Z" fill="url(#sg-red)" stroke="#5a0714" strokeWidth="0.8" />
      <circle cx="50" cy="84" r="4.5" fill="url(#sg-gold)" stroke="#6b430a" strokeWidth="0.8" />
      <text x="50" y="58" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={900} fontSize="22" fill="url(#sg-gold)" stroke="#5b3b08" strokeWidth="0.8">
        Ω
      </text>
    </g>
  );
}

function Coin() {
  return (
    <g filter="url(#sf-shadow)">
      <circle cx="50" cy="50" r="39" fill="#8a5b12" />
      <circle cx="50" cy="48" r="39" fill="url(#sg-gold)" stroke="#6b430a" strokeWidth="2" />
      <circle cx="50" cy="48" r="31" fill="none" stroke="#9a6a18" strokeWidth="1.6" strokeDasharray="1.5 3" />
      <text x="50" y="63" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={900} fontSize="40" fill="#9a6a18" stroke="#fff3c4" strokeWidth="0.8">
        Δ
      </text>
      <ellipse cx="37" cy="30" rx="13" ry="5" fill="#fff" opacity="0.45" transform="rotate(-35 37 30)" />
    </g>
  );
}

const GLYPHS: Record<string, () => ReactElement> = {
  ZEUS: Zeus,
  LIGHTNING: Lightning,
  TEMPLE: Temple,
  EAGLE: Eagle,
  SHIELD: Shield,
  LAUREL: Laurel,
  COIN: Coin,
  ACE: () => <Letter ch="A" grad="sg-card-a" />,
  KING: () => <Letter ch="K" grad="sg-card-k" />,
  QUEEN: () => <Letter ch="Q" grad="sg-card-q" />,
  JACK: () => <Letter ch="J" grad="sg-card-j" />,
};

export const SYMBOL_LABELS: Record<string, string> = {
  ZEUS: "Zeus",
  LIGHTNING: "Lightning",
  TEMPLE: "Temple",
  EAGLE: "Eagle",
  SHIELD: "Shield",
  LAUREL: "Laurel",
  COIN: "Drachma",
  ACE: "Ace",
  KING: "King",
  QUEEN: "Queen",
  JACK: "Jack",
};

export const SymbolArt = memo(function SymbolArt({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const Glyph = GLYPHS[id];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-label={SYMBOL_LABELS[id] ?? id} role="img">
      {Glyph ? <Glyph /> : null}
    </svg>
  );
});

/** Visual-only filler weights for spinning strips (outcomes come from the server). */
const FILLER: [string, number][] = [
  ["ZEUS", 4],
  ["LIGHTNING", 6],
  ["TEMPLE", 5],
  ["EAGLE", 8],
  ["SHIELD", 9],
  ["LAUREL", 9],
  ["COIN", 10],
  ["ACE", 14],
  ["KING", 14],
  ["QUEEN", 14],
  ["JACK", 14],
];
const FILLER_TOTAL = FILLER.reduce((sum, [, w]) => sum + w, 0);

export function randomFillerSymbol(): string {
  let roll = Math.random() * FILLER_TOTAL;
  for (const [id, weight] of FILLER) {
    roll -= weight;
    if (roll <= 0) return id;
  }
  return "JACK";
}
