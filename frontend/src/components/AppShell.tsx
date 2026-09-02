"use client";

/**
 * Chrome for the signed-in product: the header, the account chip, sign out, and
 * the guard that keeps signed-out visitors on the login screen.
 *
 * The guard is a convenience, not a security control -- the whole app is static
 * files and the "session" is a value in this browser (see `@/lib/session`).
 * Anything that genuinely needs protecting has to be enforced by the backend.
 */

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { endSession, initials, useSession } from "@/lib/session";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, hydrated } = useSession();

  useEffect(() => {
    if (hydrated && !session) router.replace("/");
  }, [hydrated, session, router]);

  /*
   * Until hydration the session is unknowable, and after a sign-out we are on
   * the way to the login screen. Rendering the shell in either case would flash
   * a header at someone who is not signed in, so hold an empty frame instead.
   */
  if (!hydrated || !session) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="bg-brand-navy">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Wordmark tone="onDark" className="text-lg" />

          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white"
            >
              {initials(session.name)}
            </span>
            <span className="hidden text-sm leading-tight text-white sm:block">
              {session.name}
              <span className="block text-xs text-slate-300">{session.email}</span>
            </span>
            <button
              type="button"
              onClick={endSession}
              className="rounded-md border border-white/25 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-yellow/60"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}
