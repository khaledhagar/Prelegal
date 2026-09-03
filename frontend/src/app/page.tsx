"use client";

/**
 * Sign in, or create an account.
 *
 * Both live on one screen because they are the same three fields and one
 * decision; sending someone to a second page to type the same email again is a
 * small rudeness that adds up.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import {
  requestPasswordReset,
  signIn,
  signUp,
  useSession,
} from "@/lib/session";

type Mode = "signin" | "signup" | "forgot";

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink " +
  "shadow-sm outline-none transition placeholder:text-ink-faint " +
  "focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25";

const labelClass = "block text-sm font-medium text-ink";

export default function SignInPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  //: What the server said about a reset request. Deliberately not an error --
  //: it is the same sentence whether or not the address has an account.
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && session) router.replace("/app");
  }, [hydrated, session, router]);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "forgot") {
        setNotice(await requestPasswordReset(email.trim()));
        return;
      }
      if (mode === "signup") {
        await signUp({ name: name.trim(), email: email.trim(), password });
      } else {
        await signIn({ email: email.trim(), password });
      }
      router.replace("/app");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  }

  const isSignUp = mode === "signup";
  const isForgot = mode === "forgot";

  return (
    <div className="flex min-h-screen flex-col bg-surface lg:flex-row">
      {/* Brand panel. Hidden on small screens, where it would push the form
          below the fold for no benefit. */}
      <section className="bg-brand-navy px-6 py-10 lg:flex lg:w-2/5 lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        <Wordmark tone="onDark" className="text-2xl" />

        <div className="mt-8 lg:mt-0">
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Draft an agreement by talking it through.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
            Eleven Common Paper agreements, filled in by an assistant that asks
            about one thing at a time. Watch the document build as you answer,
            then download it as a PDF.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {[
              "NDAs, cloud services, DPAs, SLAs and more",
              "A live preview that fills in as you talk",
              "Keep your drafts and come back to them",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-yellow"
                />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-10 hidden text-xs leading-relaxed text-white/50 lg:block">
          Prelegal produces drafts, not legal advice. Every document should be
          reviewed by a qualified lawyer before anyone signs it.
        </p>
      </section>

      {/* Form panel. */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-navy dark:text-white">
            {isForgot
              ? "Reset your password"
              : isSignUp
                ? "Create your account"
                : "Welcome back"}
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            {isForgot
              ? "Give us the address on the account and we will create a reset link for it."
              : isSignUp
                ? "A name, an email and a password is all it takes."
                : "Sign in to pick up where you left off."}
          </p>

          {isForgot ? (
            <button
              type="button"
              onClick={() => switchTo("signin")}
              className="mt-6 text-sm font-medium text-brand-blue underline underline-offset-2"
            >
              Back to sign in
            </button>
          ) : (
          <div
            role="tablist"
            aria-label="Sign in or create an account"
            className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-surface-sunken p-1"
          >
            {(
              [
                ["signin", "Sign in"],
                ["signup", "Create account"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => switchTo(value)}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                  (mode === value
                    ? "bg-surface text-brand-navy shadow-sm dark:text-white"
                    : "text-ink-soft hover:text-ink")
                }
              >
                {label}
              </button>
            ))}
          </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {isSignUp ? (
              <div>
                <label htmlFor="signin-name" className={labelClass}>
                  Your name
                </label>
                <input
                  id="signin-name"
                  className={`mt-1.5 ${fieldClass}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                  required
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="signin-email" className={labelClass}>
                Email
              </label>
              <input
                id="signin-email"
                type="email"
                className={`mt-1.5 ${fieldClass}`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
            </div>

            {isForgot ? null : (
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="signin-password" className={labelClass}>
                    Password
                  </label>
                  {isSignUp ? null : (
                    <button
                      type="button"
                      onClick={() => switchTo("forgot")}
                      className="text-xs font-medium text-brand-blue underline underline-offset-2"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="signin-password"
                  type="password"
                  className={`mt-1.5 ${fieldClass}`}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
                  required
                />
              </div>
            )}

            {notice ? (
              <p
                role="status"
                className="rounded-lg border border-brand-blue/40 bg-brand-blue/10 px-3 py-2 text-sm leading-relaxed text-ink"
              >
                {notice}
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
              className="w-full rounded-lg bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending
                ? "One moment…"
                : isForgot
                  ? "Create a reset link"
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
