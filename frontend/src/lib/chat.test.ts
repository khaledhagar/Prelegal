/**
 * The chat transport. What matters here is that a failing backend produces a
 * sentence a person can act on, rather than an exception reaching the UI.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatError,
  OPENING_MESSAGE,
  openingMessageFor,
  sendChat,
} from "./chat";
import { emptyValues } from "./values";

const messages = [{ role: "user" as const, content: "Acme and Globex" }];

function mockFetch(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendChat", () => {
  it("posts the transcript and everything captured so far", async () => {
    const fetchMock = mockFetch(ok({ reply: "Got it.", values: emptyValues() }));

    await sendChat(messages, emptyValues());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      messages,
      values: emptyValues(),
    });
  });

  it("returns the reply and the updated values", async () => {
    const values = {
      ...emptyValues("mutual-nda"),
      fields: { governingLaw: "Delaware" },
    };
    mockFetch(ok({ reply: "Delaware it is.", values }));

    const turn = await sendChat(messages, emptyValues());

    expect(turn.reply).toBe("Delaware it is.");
    expect(turn.values.fields.governingLaw).toBe("Delaware");
  });

  it("carries the chosen document back from the backend", async () => {
    // Which agreement to draft is settled in the same turn as the reply, so it
    // arrives on the values rather than through a second request.
    const values = emptyValues("service-level-agreement");
    mockFetch(ok({ reply: "An SLA it is.", values }));

    const turn = await sendChat(messages, emptyValues());

    expect(turn.values.documentType).toBe("service-level-agreement");
  });

  it("surfaces the backend's explanation of a failure", async () => {
    mockFetch({
      ok: false,
      json: async () => ({ detail: "The assistant is not configured." }),
    });

    await expect(sendChat(messages, emptyValues())).rejects.toThrow(
      "The assistant is not configured.",
    );
  });

  it("falls back to a readable message when the error body is not ours", async () => {
    mockFetch({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(sendChat(messages, emptyValues())).rejects.toThrow(ChatError);
    await expect(sendChat(messages, emptyValues())).rejects.toThrow(
      /Could not reach the assistant/,
    );
  });

  it("reports a readable message when there is no backend at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));

    await expect(sendChat(messages, emptyValues())).rejects.toThrow(
      /Could not reach the assistant/,
    );
  });
});

describe("the opening lines", () => {
  it("ask the first question without needing a round trip", () => {
    expect(OPENING_MESSAGE).toContain("?");
  });

  it("stay open about which document, because that is the first thing to settle", () => {
    expect(OPENING_MESSAGE).not.toMatch(/NDA/);
    expect(OPENING_MESSAGE).toMatch(/agreement|draft/i);
  });

  it("name the document when one was picked from the list", () => {
    const opening = openingMessageFor("Service Level Agreement");
    expect(opening).toContain("Service Level Agreement");
    expect(opening).toContain("?");
  });
});
