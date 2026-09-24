import { SymbolArt } from "@/components/slot/symbols";

/**
 * Poster art for a game tile / hero banner, composed from the original slot
 * symbols. Roulette gets its own drawn wheel.
 */
export function GameArt({ slug, variant = "tile" }: { slug: string; variant?: "tile" | "hero" | "banner" }) {
  if (slug === "roulette") return <RouletteArt />;
  if (variant === "banner") {
    // Wide banner: art sits on the right so copy on the left stays readable.
    return (
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(90%_120%_at_75%_40%,#6b37c4_0%,#1d0b45_55%,#07050f_100%)]" />
        <div className="art-rays absolute inset-0 opacity-50 [transform-origin:75%_45%]" />
        <SymbolArt id="LIGHTNING" className="absolute right-[30%] top-[6%] h-[20%] w-auto art-float-slow max-sm:hidden" />
        <SymbolArt id="TEMPLE" className="absolute right-[2%] top-[6%] h-[24%] w-auto art-float max-sm:right-[4%] max-sm:top-[4%] max-sm:h-[14%]" />
        <SymbolArt id="ZEUS" className="absolute right-[8%] top-[20%] h-[58%] w-auto drop-shadow-[0_0_30px_rgba(157,108,240,0.8)] art-float max-sm:right-[8%] max-sm:top-[5%] max-sm:h-[30%]" />
        <SymbolArt id="COIN" className="absolute bottom-[6%] right-[32%] h-[16%] w-auto art-float max-sm:hidden" />
        <SymbolArt id="SHIELD" className="absolute bottom-[6%] right-[2%] h-[18%] w-auto art-float-slow max-sm:hidden" />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,#5b2ea8_0%,#1d0b45_55%,#07050f_100%)]" />
      <div className="art-rays absolute inset-0 opacity-60" />
      <SymbolArt
        id="LIGHTNING"
        className={`absolute ${variant === "hero" ? "left-[5%] top-[5%] h-[22%]" : "left-[-8%] top-[8%] h-[30%]"} w-auto opacity-80 art-float-slow`}
      />
      <SymbolArt
        id="TEMPLE"
        className={`absolute ${variant === "hero" ? "right-[5%] top-[4%] h-[24%]" : "right-[-6%] top-[6%] h-[28%]"} w-auto opacity-80 art-float`}
      />
      <SymbolArt
        id="ZEUS"
        className={`absolute left-1/2 ${variant === "hero" ? "top-[20%] h-[50%]" : "top-[18%] h-[62%]"} w-auto -translate-x-1/2 drop-shadow-[0_0_30px_rgba(157,108,240,0.8)] art-float`}
      />
      <SymbolArt id="COIN" className="absolute bottom-[20%] left-[10%] h-[18%] w-auto art-float-slow" />
      <SymbolArt id="SHIELD" className="absolute bottom-[22%] right-[8%] h-[20%] w-auto art-float" />
    </div>
  );
}

function RouletteArt() {
  const pockets = 37;
  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#0f5a3a_0%,#06291a_60%,#030d08_100%)]">
      <svg viewBox="0 0 200 200" className="absolute left-1/2 top-[14%] h-[70%] w-auto -translate-x-1/2 animate-[spin_24s_linear_infinite]">
        <circle cx="100" cy="100" r="96" fill="#4a2a0a" stroke="#d0a755" strokeWidth="4" />
        {Array.from({ length: pockets }, (_, i) => {
          const a0 = (i / pockets) * Math.PI * 2;
          const a1 = ((i + 1) / pockets) * Math.PI * 2;
          const r = 86;
          const x0 = (100 + r * Math.cos(a0)).toFixed(2);
          const y0 = (100 + r * Math.sin(a0)).toFixed(2);
          const x1 = (100 + r * Math.cos(a1)).toFixed(2);
          const y1 = (100 + r * Math.sin(a1)).toFixed(2);
          const fill = i === 0 ? "#1f9d55" : i % 2 ? "#c81d2e" : "#141414";
          return <path key={i} d={`M100 100 L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`} fill={fill} stroke="#d0a755" strokeWidth="0.6" />;
        })}
        <circle cx="100" cy="100" r="44" fill="#6b3f12" stroke="#d0a755" strokeWidth="3" />
        <circle cx="100" cy="100" r="12" fill="#d0a755" />
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x="97" y="58" width="6" height="84" rx="3" fill="#e9d2a1" transform={`rotate(${k * 45} 100 100)`} />
        ))}
      </svg>
      <div className="absolute right-[18%] top-[18%] h-3 w-3 rounded-full bg-white shadow-[0_0_12px_white]" />
    </div>
  );
}
