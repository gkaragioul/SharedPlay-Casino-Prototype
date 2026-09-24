import type { Config } from "tailwindcss";

/**
 * SharedPlay Casino design tokens.
 *
 * Premium European casino: deep charcoal, gold/bronze accents, subtle green for
 * positive/interactive states. No neon, no crypto-casino gradients.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090d",
          900: "#0b0d13",
          850: "#0f1219",
          800: "#141824",
          700: "#1b2130",
          600: "#252c3d",
        },
        gold: {
          50: "#faf3e4",
          100: "#f3e5c8",
          200: "#e9d2a1",
          300: "#ddbc76",
          400: "#d0a755",
          500: "#c19340",
          600: "#a47a33",
          700: "#82602a",
          800: "#634923",
          900: "#4a361d",
        },
        bronze: "#a9793f",
        lucky: {
          400: "#4ade9d",
          500: "#2fbf85",
          600: "#22a06e",
        },
        ember: "#e0603f",
        danger: "#e05a6b",
      },
      fontFamily: {
        display: ["Georgia", "'Times New Roman'", "Times", "serif"],
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        luxe: "0.18em",
        wide2: "0.08em",
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 50px -30px rgba(0,0,0,0.9)",
        gold: "0 0 0 1px rgba(193,147,64,0.35), 0 10px 30px -12px rgba(193,147,64,0.45)",
        glow: "0 0 24px -6px rgba(193,147,64,0.55)",
      },
      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #f3e5c8 0%, #d0a755 35%, #a47a33 60%, #e9d2a1 100%)",
        "felt-dark":
          "radial-gradient(120% 100% at 50% 0%, rgba(193,147,64,0.07) 0%, rgba(8,9,13,0) 60%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-gold": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(193,147,64,0.45)" },
          "50%": { boxShadow: "0 0 0 8px rgba(193,147,64,0)" },
        },
        "float-up": {
          "0%": { opacity: "0", transform: "translateY(0) scale(0.8)" },
          "15%": { opacity: "1", transform: "translateY(-8px) scale(1.1)" },
          "100%": { opacity: "0", transform: "translateY(-120px) scale(1)" },
        },
        "spin-slow": {
          to: { transform: "translateY(-360px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-up 0.3s ease both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-gold": "pulse-gold 2s ease-in-out infinite",
        "float-up": "float-up 2.4s ease-out forwards",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
