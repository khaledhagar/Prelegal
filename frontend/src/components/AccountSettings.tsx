"use client";

/**
 * The signed-in account: who you are, and changing your password.
 *
 * The current password is asked for even though the session already proves
 * somebody is signed in. The session only proves *somebody* is -- without the
 * second check, a browser left open would be enough to take the account for
 * good.
 */

import { useState, type FormEvent } from "react";
import { changePassword, useSession } from "@/lib/session";

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink " +
  "shadow-sm outline-none transition placeholder:text-ink-faint " +
  "focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25";

const labelClass = "block text-sm font-medium text-ink";

export function AccountSettings() {
  const { session } = useSession();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // The second box is a typing aid; the API has no business knowing about it.
    if (next !== confirmation) {
      setError("Those two passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);
    setDone(false);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirmation("");
      setDone(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not change the password.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <h1 className="text-xl font-semibold tracking-tight text-brand-navy dark:text-white">
            Account
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {session
              ? `Signed in as ${session.email}.`
              : "Signed in."}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-brand-navy dark:text-white">
            Change your password
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Changing it signs out every other browser that is currently signed
            in to this account. This one stays.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="account-current" className={labelClass}>
                Current password
              </label>
              <input
                id="account-current"
                type="password"
                className={`mt-1.5 ${fieldClass}`}
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label htmlFor="account-new" className={labelClass}>
                New password
              </label>
              <input
                id="account-new"
                type="password"
                className={`mt-1.5 ${fieldClass}`}
                value={next}
                onChange={(event) => setNext(event.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
              />
            </div>

            <div>
              <label htmlFor="account-confirm" className={labelClass}>
                Type the new one again
              </label>
              <input
                id="account-confirm"
                type="password"
                className={`mt-1.5 ${fieldClass}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                required
              />
            </div>

            {done ? (
              <p
                role="status"
                className="rounded-lg border border-brand-blue/40 bg-brand-blue/10 px-3 py-2 text-sm text-ink"
              >
                Password changed. Any other signed-in browser has been signed
                out.
              </p>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "One moment…" : "Change password"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
