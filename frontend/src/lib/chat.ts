/**
 * Talking to the drafting assistant.
 *
 * The conversation lives here in the browser: every turn sends the whole
 * transcript and everything captured so far, and gets back what to say next
 * plus those values with the assistant's edits already applied. The backend
 * keeps nothing, so a reload starts over.
 *
 * The request is same-origin because FastAPI serves this app. That means chat
 * only works when the full stack is running (`scripts/start-*`); `npm run dev`
 * on its own has no /api to call.
 */

import { ApiError, postJson } from "@/lib/api";
import type { DocumentValues } from "@/lib/documents/types";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * The assistant's first line, written here rather than fetched.
 *
 * Asking the model to say hello would cost a round trip before the user has
 * said anything, and the opening question is the same every time. It stays open
 * about what the user wants rather than naming a document, because working that
 * out is the assistant's first job.
 */
export const OPENING_MESSAGE =
  "Hi — I can help you put together a legal agreement. What are you looking " +
  "to draft, and who are the two companies involved?";

/** The opening line once a document has already been picked from the list. */
export function openingMessageFor(name: string): string {
  return (
    `Hi — let's put together a ${name}. To start: which two companies are ` +
    `entering into it?`
  );
}

export type ChatTurn = {
  reply: string;
  values: DocumentValues;
};

/**
 * Thrown with a message already written for someone to read on screen.
 *
 * Kept as its own type so the chat UI can tell "the assistant is unavailable"
 * apart from any other failure, and re-thrown from `ApiError` rather than
 * replacing it -- `sendChat` is the only caller that needs the distinction.
 */
export class ChatError extends Error {}

const FALLBACK_ERROR =
  "Could not reach the assistant. Check that the backend is running and try again.";

export async function sendChat(
  messages: ChatMessage[],
  values: DocumentValues,
): Promise<ChatTurn> {
  try {
    return await postJson<ChatTurn>(
      "/api/chat",
      { messages, values },
      FALLBACK_ERROR,
    );
  } catch (error) {
    // A lost session is not an assistant problem, and the workspace handles it
    // by sending the user to sign in again -- so it travels on unchanged.
    if (error instanceof ApiError && error.isUnauthenticated) throw error;
    throw new ChatError(
      error instanceof Error ? error.message : FALLBACK_ERROR,
    );
  }
}
