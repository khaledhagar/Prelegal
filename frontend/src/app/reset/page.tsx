"use client";

/**
 * Setting a new password from a reset link.
 *
 * The token is read from the query string with `useSyncExternalStore` rather
 * than `useSearchParams`, which in a static export forces the whole page behind
 * a Suspense boundary for a value we can read directly. The store's server
 * snapshot is what keeps the prerendered HTML -- which has no query string --
 * from disagreeing with the browser at hydration.
 *
 * Nothing here reveals whether the token is any good until it is submitted:
 * checking on arrival would turn the page into an oracle for guessed links.
 */

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { resetPassword } from "@/lib/session";

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink " +
  "shadow-sm outline-none transition placeholder:text-ink-faint " +
  "focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25";

const labelClass = "block text-sm font-medium text-ink";

//: The query string never changes while this page is open, so there is nothing
//: to subscribe to -- but `useSyncExternalStore` wants a stable subscribe.
const subscribe = () => () => {};

const tokenFromLocation = (): string | null =>
  new URLSearchParams(window.location.search).get("token");

//: Prerendered HTML has no query string, and claiming otherwise would make the
//: first client render disagree with it.
const noTokenOnServer = (): string | null => null;

const mountedInBrowser = () => true;
const notMountedOnServer = () => false;

export default function ResetPasswordPage() {
  const router = useRouter();

  const token = useSyncExternalStore(subscribe, tokenFromLocation, noTokenOnServer);
  const ready = useSyncExternalStore(
    subscribe,
    mountedInBrowser,
    notMountedOnServer,
  );

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;

    // Checked here rather than on the server: the two-box confirmation is a
    // typing aid, and the API has no business knowing about the second box.
    if (password !== confirmation) {
      setError("Those two passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="bg-brand-navy px-6 py-4">
        <Wordmark tone="onDark" className="text-lg" />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {!ready ? null : done ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-brand-navy dark:text-white">
                Password changed
              </h1>
              <p
                role="status"
                className="mt-3 text-sm leading-relaxed text-ink-soft"
              >
                Every session that was open has been signed out, including any
                the person who asked for this link may have had. Sign in with
                the new password.
              </p>
              <button
                type="button"
                onClick={() => router.replace("/")}
                className="mt-6 w-full rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Go to sign in
              </button>
            </>
          ) : token === null ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-brand-navy dark:text-white">
                This link is incomplete
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                A reset link carries a token in its address, and this one has
                none. Ask for a new link from the sign-in screen.
              </p>
              <button
                type="button"
                onClick={() => router.replace("/")}
                className="mt-6 w-full rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-brand-navy dark:text-white">
                Choose a new password
              </h1>
              <p className="mt-1.5 text-sm text-ink-soft">
                The link works once, and only for the next half hour.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <div>
                  <label htmlFor="reset-password" className={labelClass}>
                    New password
                  </label>
                  <input
                    id="reset-password"
                    type="password"
                    className={`mt-1.5 ${fieldClass}`}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="reset-confirm" className={labelClass}>
                    Type it again
                  </label>
                  <input
                    id="reset-confirm"
                    type="password"
                    className={`mt-1.5 ${fieldClass}`}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    required
                  />
                </div>

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
                  className="w-full rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "One moment…" : "Set new password"}
                </button>
              </form>
            </>
          )}

          <p className="mt-8 text-xs leading-relaxed text-ink-faint">
            Prelegal produces drafts, not legal advice. Every document
            generated here is subject to review by a qualified lawyer before it
            is signed or relied upon.
          </p>
        </div>
      </main>
    </div>
  );
}
