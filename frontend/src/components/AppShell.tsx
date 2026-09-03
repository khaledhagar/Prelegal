"use client";

/**
 * Chrome for the signed-in product: the header, navigation, the account chip,
 * sign out, and the guard that keeps signed-out visitors on the sign-in screen.
 *
 * The guard is a convenience for the person using the app, not the security
 * control -- the frontend is static files, so anyone can ask for this page.
 * What actually protects anything is the backend: `/api/chat` and `/api/drafts`
 * refuse without a session cookie (see `app/dependencies.py`).
 */

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { initials, signOut, useSession } from "@/lib/session";

const NAV = [
  { href: "/app", label: "Draft" },
  { href: "/app/documents", label: "My documents" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, hydrated } = useSession();

  useEffect(() => {
    if (hydrated && !session) router.replace("/");
  }, [hydrated, session, router]);

  /*
   * Until the first `/api/auth/me` answers, the session is unknowable; after a
   * sign-out we are on the way to the sign-in screen. Rendering the shell in
   * either case would flash a header at someone who is not signed in, so hold
   * an empty frame instead.
   */
  if (!hydrated || !session) {
    return <div className="min-h-screen bg-canvas" />;
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 bg-brand-navy shadow-sm">
        {/*
          `flex-wrap` is the part that matters: the wordmark, both nav links and
          the account block want about 423px, which is more than a 390px phone
          has, and a rigid single row answers that by pushing the sign-out
          button past the right edge and scrolling the whole page sideways.
          Wrapping puts the account block on a second line instead. The tighter
          padding and gaps below `sm` are what usually keep it to one row; the
          wrap is what guarantees it can never overflow again, whatever a
          future nav item or a long name does.
        */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-8">
            <Wordmark tone="onDark" className="text-lg" />

            <nav aria-label="Sections" className="flex items-center gap-1">
              {NAV.map((item) => {
                // `/app/documents` also starts with `/app`, so the drafter tab
                // has to match exactly or both would light up at once.
                const active =
                  item.href === "/app"
                    ? pathname === "/app" || pathname === "/app/"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                      (active
                        ? "bg-white/15 text-white"
                        : "text-white/70 hover:bg-white/10 hover:text-white")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white"
            >
              {initials(session.name)}
            </span>
            <span className="hidden text-sm leading-tight text-white sm:block">
              {session.name}
              <span className="block text-xs text-white/60">{session.email}</span>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="shrink-0 whitespace-nowrap rounded-md border border-white/25 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-line bg-surface">
        <p className="mx-auto max-w-7xl px-6 py-4 text-xs leading-relaxed text-ink-faint">
          Prelegal produces <strong className="font-semibold">drafts</strong>,
          not legal advice. Every document generated here is subject to review
          by a qualified lawyer before it is signed or relied upon.
        </p>
      </footer>
    </div>
  );
}
