import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SharedPlay Casino",
  description:
    "Demo-credits multiplayer casino prototype. Shared sessions, shared bankroll, group decisions. No real money.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-dvh bg-felt-dark">{children}</div>
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-3">
          <span className="rounded-full border border-white/10 bg-ink-900/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500 backdrop-blur">
            Demo credits only · no real money
          </span>
        </div>
      </body>
    </html>
  );
}
