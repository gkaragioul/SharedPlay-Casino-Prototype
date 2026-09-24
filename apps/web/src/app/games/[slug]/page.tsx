import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@sharedplay/db";
import { SlotMachine } from "@/components/slot/slot-machine";
import "@/components/slot/slot.css";
import { TempleClient } from "./temple-client";

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSessionUser();
  const game = await prisma.game.findUnique({ where: { slug } });
  if (!game) notFound();

  if (slug === "temple-of-zeus") {
    return (
      <SlotMachine
        gameName={game.name}
        startBalance={user.demoBalance}
        displayName={user.displayName}
      />
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 py-6 sm:px-6">
      <TempleClient
        gameSlug={slug}
        gameName={game.name}
        startBalance={user.demoBalance}
        userId={user.id}
        supported={false}
      />
    </div>
  );
}
