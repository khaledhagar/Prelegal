"use client";

/**
 * The signed-in session.
 *
 * PL-4 deliberately ships a *fake* sign-in: there is no password, no server
 * call and no account. Whatever the user types on the login screen is kept in
 * this browser and nowhere else, purely so the app has someone to greet and a
 * "sign out" that does something. The backend's `users` table exists but is not
 * written to yet.
 *
 * This module is the single place that assumption lives. When real
 * authentication arrives it replaces the storage calls below; every component
 * already talks to `useSession`, `startSession` and `endSession`, so none of
 * them need to change.
 */

import { useSyncExternalStore } from "react";

export type Session = {
  name: string;
  email: string;
};

const STORAGE_KEY = "prelegal.session";

/**
 * Fired on `window` after a same-tab change. The built-in `storage` event only
 * reaches *other* tabs, so without this the header would not notice its own
 * sign-out until a reload.
 */
const CHANGE_EVENT = "prelegal:session-change";

/**
 * Storage access throws outright in some privacy modes rather than returning
 * null, so every read and write is guarded. A browser that refuses to remember
 * the session degrades to "signed out", which is a usable state.
 */
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Nothing to do -- the session simply will not survive a reload.
  }
}

function parse(raw: string | null): Session | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { name, email } = parsed as Partial<Session>;
    if (typeof name !== "string" || typeof email !== "string") return null;
    return { name, email };
  } catch {
    return null;
  }
}

/*
 * `useSyncExternalStore` re-reads the snapshot on every render and bails out of
 * updating only if the value is referentially equal to the last one. Parsing
 * the JSON on each call would hand it a fresh object every time and spin
 * forever, so the parsed session is cached against the raw string it came from.
 */
let cachedRaw: string | null = null;
let cachedSession: Session | null = null;

function getSnapshot(): Session | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parse(raw);
  }
  return cachedSession;
}

/** The prerendered HTML has no browser storage, so it always renders signed out. */
function getServerSnapshot(): Session | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

/** Signs the user in. No credentials are checked -- see the note at the top. */
export function startSession(session: Session): void {
  writeRaw(JSON.stringify(session));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function endSession(): void {
  writeRaw(null);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export type SessionState = {
  session: Session | null;
  /**
   * False during the server-rendered pass and the hydration render, when the
   * session is unknowable. Guards must wait for this before deciding to
   * redirect, or a signed-in user gets bounced back to the login screen on
   * every page load.
   */
  hydrated: boolean;
};

export function useSession(): SessionState {
  const session = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return { session, hydrated };
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
