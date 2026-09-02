"use client";

/**
 * The sign-in screen.
 *
 * Nothing here authenticates anybody: PL-4 asks for a fake login that simply
 * brings the user through to the platform. The form collects a name and an
 * email so the shell has someone to greet, hands them to `startSession`, and
 * navigates on. The screen says so plainly rather than implying a security
 * boundary that does not exist.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { startSession, useSession } from "@/lib/session";

const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm " +
  "outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function SignIn() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  /*
   * The one way off this screen, for both the visitor who just signed in and
   * the one who arrived already signed in. Submitting only starts the session
   * and lets this fire, so there is a single navigation path rather than two
   * that race. `replace` rather than `push`: going back to the login screen
   * from inside the app would only bounce straight here again.
   */
  useEffect(() => {
    if (hydrated && session) router.replace("/app");
  }, [hydrated, session, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startSession({ name: name.trim(), email: email.trim() });
  }

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row dark:bg-slate-950">
      {/* Brand panel. Purely decorative, so it collapses away on small screens. */}
      <aside className="bg-brand-navy px-6 py-10 lg:flex lg:w-2/5 lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        <Wordmark tone="onDark" className="text-2xl" />
        <div className="mt-8 hidden lg:mt-0 lg:block">
          <h2 className="text-3xl font-semibold leading-tight text-white">
            Agreements worth signing,
            <br />
            drafted in minutes.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
            Start from proven templates, fill in what matters, and download a
            complete document.
          </p>
        </div>
        <p className="mt-8 hidden text-xs text-slate-400 lg:mt-0 lg:block">
          Templates by Common Paper, used under CC BY 4.0.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-brand-navy dark:text-white">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-brand-gray">
            Tell us who you are and we&apos;ll take you to your documents.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="signin-name" className="block text-sm font-medium">
                Full name
              </label>
              <input
                id="signin-name"
                className={fieldClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signin-email" className="block text-sm font-medium">
                Work email
              </label>
              <input
                id="signin-email"
                type="email"
                className={fieldClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ada@acme.com"
                autoComplete="email"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-brand-purple/40"
            >
              Continue to Prelegal
            </button>
          </form>

          <p className="mt-6 rounded-md border border-brand-yellow/40 bg-brand-yellow/10 px-3 py-2 text-xs leading-relaxed text-brand-navy dark:text-brand-yellow">
            <strong className="font-semibold">Placeholder sign-in.</strong> No
            account is created and no password is checked — whatever you type
            stays in this browser. Real accounts arrive in a later release.
          </p>
        </div>
      </main>
    </div>
  );
}
