"use client";

/**
 * The signed-in session.
 *
 * PL-7 made this real. The session lives in an httpOnly cookie the browser
 * sends automatically and no script here can read -- including this one. So
 * there is nothing to store locally: who is signed in is whatever
 * `GET /api/auth/me` says, cached in this module and refreshed when it changes.
 *
 * Components still talk to `useSession`, `signIn`, `signUp` and `signOut`, so
 * the shape they depend on has not moved.
 */

import { useSyncExternalStore } from "react";
import { ApiError, getJson, postJson } from "@/lib/api";

export type Session = {
  id: number;
  name: string;
  email: string;
};

export type Credentials = {
  email: string;
  password: string;
};

export type Registration = Credentials & { name: string };

const UNREACHABLE =
  "Could not reach the server. Check that the backend is running and try again.";

/*
 * The store. `useSyncExternalStore` compares snapshots by reference, so the
 * session object is only replaced when it genuinely changes -- returning a
 * fresh object each read would re-render forever.
 */
let session: Session | null = null;
let loaded = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function set(next: Session | null): void {
  session = next;
  loaded = true;
  announce();
}

/**
 * Asks the backend who is signed in, once.
 *
 * A 401 is the ordinary "nobody" answer, not a failure. Any other error also
 * resolves to signed out: the app cannot show the workspace without a session,
 * and the sign-in screen is where a person can do something about it.
 */
function load(): Promise<void> {
  inFlight ??= getJson<Session>("/api/auth/me", UNREACHABLE)
    .then((account) => set(account))
    .catch(() => set(null))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded && inFlight === null) void load();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Session | null {
  return session;
}

/** The prerendered HTML has no cookie to read, so it renders signed out. */
function getServerSnapshot(): Session | null {
  return null;
}

function hydratedSnapshot(): boolean {
  return loaded;
}

function serverHydratedSnapshot(): boolean {
  return false;
}

/** Registers an account and signs in. Throws `ApiError` with a readable message. */
export async function signUp(registration: Registration): Promise<Session> {
  const account = await postJson<Session>(
    "/api/auth/signup",
    registration,
    UNREACHABLE,
  );
  set(account);
  return account;
}

export async function signIn(credentials: Credentials): Promise<Session> {
  const account = await postJson<Session>("/api/auth/login", credentials, UNREACHABLE);
  set(account);
  return account;
}

/**
 * Ends the session.
 *
 * The local state is cleared even if the request fails: the user asked to be
 * signed out, and leaving them looking signed in because the network blinked
 * would be the wrong way to be wrong.
 */
export async function signOut(): Promise<void> {
  try {
    await postJson<void>("/api/auth/logout", {}, UNREACHABLE);
  } catch {
    // Nothing useful to say -- the cookie may well be gone anyway.
  } finally {
    set(null);
  }
}

/**
 * Records that the server has rejected our session.
 *
 * Called when a request comes back 401 mid-use, which means the session expired
 * or the server restarted and took the database with it. Without this the app
 * would keep showing a signed-in header over an API that refuses everything.
 */
export function forgetSession(): void {
  if (session !== null) set(null);
}

/** True when an error means the session is gone rather than something broke. */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.isUnauthenticated;
}

export type SessionState = {
  session: Session | null;
  /**
   * False until the first `/api/auth/me` has answered, when the session is
   * unknowable. Guards must wait for this before deciding to redirect, or a
   * signed-in user gets bounced to the login screen on every page load.
   */
  hydrated: boolean;
};

export function useSession(): SessionState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    hydratedSnapshot,
    serverHydratedSnapshot,
  );
  return { session: current, hydrated };
}

/** Drops the cached session. For tests, which need a clean module per case. */
export function resetSessionForTests(): void {
  session = null;
  loaded = false;
  inFlight = null;
}

/** The initials shown in the header chip, e.g. "Ada Lovelace" -> "AL". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = [parts[0], parts[parts.length - 1]]
    .slice(0, parts.length === 1 ? 1 : 2)
    .map((part) => part[0].toUpperCase());
  return letters.join("");
}
