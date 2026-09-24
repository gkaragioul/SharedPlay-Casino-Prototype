import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@sharedplay/db";
import { buildSessionView } from "../../../../server/realtime/view";
import { SharedTable } from "@/components/shared/shared-table";
import "@/components/slot/slot.css";
import "@/components/shared/shared.css";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireSessionUser();

  const exists = await prisma.sharedSession.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();
  const view = await buildSessionView(id);

  return (
    <SharedTable
      sessionId={view.id}
      userId={user.id}
      displayName={user.displayName}
      initialView={view}
    />
  );
}
