import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteDraft,
  formatSavedAt,
  listDrafts,
  readDraft,
  saveDraft,
  suggestedTitle,
} from "./drafts";
import { emptyValues } from "./values";

function stub(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ok = (body: unknown, status = 200) => ({
  ok: true,
  status,
  json: async () => body,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the drafts API", () => {
  it("lists what the user has saved", async () => {
    const fetchMock = stub(ok([{ id: 1 }]));

    await expect(listDrafts()).resolves.toEqual([{ id: 1 }]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/drafts");
  });

  it("reads one by id", async () => {
    const fetchMock = stub(ok({ id: 4 }));

    await readDraft(4);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/drafts/4");
  });

  it("sends the document type, title and answers when saving", async () => {
    const fetchMock = stub(ok({ id: 1 }, 201));
    const values = emptyValues("mutual-nda");

    await saveDraft("mutual-nda", "Acme & Globex", values);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/drafts");
    expect(JSON.parse(init.body)).toEqual({
      documentType: "mutual-nda",
      title: "Acme & Globex",
      values,
    });
  });

  it("deletes by id", async () => {
    const fetchMock = stub({ ok: true, status: 204, json: async () => ({}) });

    await deleteDraft(9);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/drafts/9");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("suggestedTitle", () => {
  const withParties = (...companies: string[]) => ({
    ...emptyValues("mutual-nda"),
    parties: [
      { company: companies[0] ?? "", printName: "", title: "", noticeAddress: "" },
      { company: companies[1] ?? "", printName: "", title: "", noticeAddress: "" },
    ] as [never, never],
  });

  it("names both parties when they are known", () => {
    expect(suggestedTitle("Mutual NDA", withParties("Acme Ltd", "Globex Inc"))).toBe(
      "Mutual NDA — Acme Ltd & Globex Inc",
    );
  });

  it("uses whichever party is known", () => {
    expect(suggestedTitle("Mutual NDA", withParties("Acme Ltd"))).toBe(
      "Mutual NDA — Acme Ltd",
    );
  });

  it("falls back to the document name alone", () => {
    expect(suggestedTitle("Pilot Agreement", emptyValues("pilot-agreement"))).toBe(
      "Pilot Agreement",
    );
  });
});

describe("formatSavedAt", () => {
  it("reads SQLite's timestamp as UTC, not local time", () => {
    // Without the Z the browser would read it as local and could show a draft
    // saved hours in the future.
    const rendered = formatSavedAt("2026-09-03 10:45:48");
    expect(rendered).not.toBe("2026-09-03 10:45:48");
    expect(rendered).toMatch(/2026/);
  });

  it("leaves an unparseable timestamp alone", () => {
    expect(formatSavedAt("whenever")).toBe("whenever");
  });
});
