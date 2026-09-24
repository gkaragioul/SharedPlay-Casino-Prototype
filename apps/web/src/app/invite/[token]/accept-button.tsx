"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInviteButton({
  token,
  sessionId,
  alreadyJoined,
  suggested,
}: {
  token: string;
  sessionId: string;
  alreadyJoined: boolean;
  suggested: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(suggested);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, token, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not join.");
        return;
      }
      router.push(`/sessions/${sessionId}`);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  if (alreadyJoined) {
    return (
      <button
        type="button"
        className="btn-gold w-full py-3 text-sm"
        onClick={() => {
          router.push(`/sessions/${sessionId}`);
        }}
      >
        Back to table
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <label className="label" htmlFor="amount">
        Contribution
      </label>
      <input
        id="amount"
        type="number"
        min={10}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="input"
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={accept}
        disabled={loading || amount < 10}
        className="btn-gold w-full py-3 text-sm"
      >
        {loading ? "Joining…" : `Join with ${amount} credits`}
      </button>
    </div>
  );
}
