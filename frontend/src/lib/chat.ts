/**
 * Talking to the drafting assistant.
 *
 * The conversation lives here in the browser: every turn sends the whole
 * transcript and the current cover page, and gets back what to say next plus
 * the cover page with the assistant's edits already applied. The backend keeps
 * nothing, so a reload starts over.
 *
 * The request is same-origin because FastAPI serves this app. That means chat
 * only works when the full stack is running (`scripts/start-*`); `npm run dev`
 * on its own has no /api to call.
 */

import type { NdaFormValues } from "@/lib/form";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * The assistant's first line, written here rather than fetched.
 *
 * Asking the model to say hello would cost a round trip before the user has
 * said anything, and the opening question is the same every time.
 */
export const OPENING_MESSAGE =
  "Hi — I'll help you put together a mutual NDA. To start: which two " +
  "companies are signing, and what are they sharing information about?";

export type ChatTurn = {
  reply: string;
  fields: NdaFormValues;
};

/** Thrown with a message already written for someone to read on screen. */
export class ChatError extends Error {}

const FALLBACK_ERROR =
  "Could not reach the assistant. Check that the backend is running and try again.";

export async function sendChat(
  messages: ChatMessage[],
  fields: NdaFormValues,
): Promise<ChatTurn> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, fields }),
    });
  } catch {
    // Offline, or no backend at all -- `fetch` rejects rather than returning.
    throw new ChatError(FALLBACK_ERROR);
  }

  if (!response.ok) {
    // The backend writes `detail` for a person to read; anything else means we
    // are talking to something that is not our API.
    const detail = await response
      .json()
      .then((body: { detail?: unknown }) =>
        typeof body.detail === "string" ? body.detail : null,
      )
      .catch(() => null);
    throw new ChatError(detail ?? FALLBACK_ERROR);
  }

  return (await response.json()) as ChatTurn;
}
