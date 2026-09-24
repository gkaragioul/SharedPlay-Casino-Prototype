import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { buildInvitationPreview } from "../../../../server/realtime/view";
import { formatCredits } from "@/lib/format";
import { AcceptInviteButton } from "./accept-button";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await requireSessionUser();

  let preview;
  try {
    preview = await buildInvitationPreview(token, user.id);
  } catch {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <div className="panel p-8 text-center">
          <p className="text-stone-300">This invitation link is not valid.</p>
          <Link href="/lobby" className="btn-ghost mt-4 px-5 py-2 text-sm">
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="animate-fade-up panel p-8">
        <p className="label text-gold-500/80">You&apos;re invited</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-stone-100">
          {preview.senderName} invited you
        </h1>
        <p className="mt-2 text-sm text-stone-400">
          {preview.gameName} · table {preview.sessionCode}
        </p>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Suggested contribution</dt>
            <dd className="font-semibold text-stone-200">
              {formatCredits(preview.suggestedContribution)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Players</dt>
            <dd className="text-stone-200">{preview.participantCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Bankroll</dt>
            <dd className="text-stone-200">{formatCredits(preview.currentBankroll)}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <AcceptInviteButton
            token={preview.token}
            sessionId={preview.sessionId}
            alreadyJoined={preview.alreadyJoined}
            suggested={preview.suggestedContribution}
          />
        </div>

        <p className="mt-4 text-center text-xs text-stone-600">
          Demo credits only · joining moves play money into the shared pot
        </p>
      </div>
    </main>
  );
}
