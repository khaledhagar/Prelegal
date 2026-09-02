/**
 * The chat transport. What matters here is that a failing backend produces a
 * sentence a person can act on, rather than an exception reaching the UI.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatError, OPENING_MESSAGE, sendChat } from "./chat";
import { emptyFormValues } from "./form";

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
  it("posts the transcript and the current values", async () => {
    const fetchMock = mockFetch(
      ok({ reply: "Got it.", fields: emptyFormValues() }),
    );

    await sendChat(messages, emptyFormValues());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      messages,
      fields: emptyFormValues(),
    });
  });

  it("returns the reply and the updated values", async () => {
    const fields = { ...emptyFormValues(), governingLaw: "Delaware" };
    mockFetch(ok({ reply: "Delaware it is.", fields }));

    const turn = await sendChat(messages, emptyFormValues());

    expect(turn.reply).toBe("Delaware it is.");
    expect(turn.fields.governingLaw).toBe("Delaware");
  });

  it("surfaces the backend's explanation of a failure", async () => {
    mockFetch({
      ok: false,
      json: async () => ({ detail: "The assistant is not configured." }),
    });

    await expect(sendChat(messages, emptyFormValues())).rejects.toThrow(
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

    await expect(sendChat(messages, emptyFormValues())).rejects.toThrow(ChatError);
    await expect(sendChat(messages, emptyFormValues())).rejects.toThrow(
      /Could not reach the assistant/,
    );
  });

  it("reports a readable message when there is no backend at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));

    await expect(sendChat(messages, emptyFormValues())).rejects.toThrow(
      /Could not reach the assistant/,
    );
  });
});

describe("OPENING_MESSAGE", () => {
  it("asks the first question without needing a round trip", () => {
    expect(OPENING_MESSAGE).toMatch(/compan/i);
    expect(OPENING_MESSAGE).toContain("?");
  });
});
