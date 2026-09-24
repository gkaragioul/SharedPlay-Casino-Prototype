"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign-up failed.");
        return;
      }
      router.push("/lobby");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="animate-fade-up panel p-8">
        <p className="label mb-2 text-gold-500/80">Demo credits only</p>
        <h1 className="font-display text-3xl font-bold text-stone-100">Create account</h1>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input mt-1.5"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="e.g. aria"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="displayName">
              Display name
            </label>
            <input
              id="displayName"
              className="input mt-1.5"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How friends see you"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              autoComplete="new-password"
              required
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button type="submit" className="btn-gold w-full py-3 text-sm" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-500">
          Already have one?{" "}
          <Link href="/login" className="text-gold-300 hover:text-gold-200">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
