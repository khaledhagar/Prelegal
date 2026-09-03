/**
 * The workspace end to end: choosing a document, talking to the assistant, and
 * watching the agreement fill in. `sendChat` is stubbed -- what is under test is
 * how the pieces are wired together, not the transport, which
 * src/lib/chat.test.ts covers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const sendChat = vi.fn();
const saveDraft = vi.fn();
const readDraft = vi.fn();
const replace = vi.fn();

vi.mock("@react-pdf/renderer", () => ({ pdf: () => ({ toBlob: vi.fn() }) }));
vi.mock("@/pdf/AgreementDocument", () => ({ AgreementPdfDocument: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
vi.mock("@/lib/drafts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drafts")>();
  return {
    ...actual,
    saveDraft: (...args: Parameters<typeof actual.saveDraft>) => saveDraft(...args),
    readDraft: (...args: Parameters<typeof actual.readDraft>) => readDraft(...args),
  };
});
vi.mock("@/lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat")>();
  return {
    ...actual,
    sendChat: (...args: Parameters<typeof actual.sendChat>) => sendChat(...args),
  };
});

import { DocumentCreator } from "./DocumentCreator";
import { ChatError } from "@/lib/chat";
import { ApiError } from "@/lib/api";
import { emptyValues } from "@/lib/values";

/** A backend reply that settles on a document and records some fields. */
function turn(
  reply: string,
  documentType = "",
  fields: Record<string, string> = {},
) {
  return {
    reply,
    values: { ...emptyValues(documentType), fields },
  };
}

async function say(text: string) {
  await userEvent.type(screen.getByLabelText(/message the assistant/i), text);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
}

beforeEach(() => {
  sendChat.mockReset();
  saveDraft.mockReset().mockResolvedValue({
    id: 1,
    documentType: "mutual-nda",
    title: "saved",
    createdAt: "2026-09-03 10:00:00",
    updatedAt: "2026-09-03 10:00:00",
  });
  readDraft.mockReset();
  replace.mockReset();
  window.history.replaceState({}, "", "/app");
  Element.prototype.scrollIntoView = vi.fn();
});

describe("before an agreement is chosen", () => {
  it("opens without naming a document, because that is the first thing to settle", () => {
    render(<DocumentCreator />);
    expect(screen.getByRole("heading", { level: 1, name: /agreement drafter/i })).toBeInTheDocument();
  });

  it("explains that the preview is waiting", () => {
    render(<DocumentCreator />);
    expect(screen.getByText(/no agreement chosen yet/i)).toBeInTheDocument();
  });

  it("offers no download until there is something to download", () => {
    render(<DocumentCreator />);
    expect(
      screen.queryByRole("button", { name: /download pdf/i }),
    ).not.toBeInTheDocument();
  });
});

describe("choosing from the list", () => {
  it("switches the workspace to that agreement", async () => {
    render(<DocumentCreator />);
    await userEvent.click(screen.getByRole("button", { name: "Pilot Agreement" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Pilot Agreement" }),
    ).toBeInTheDocument();
  });

  it("speaks into the conversation rather than switching silently", async () => {
    render(<DocumentCreator />);
    await userEvent.click(screen.getByRole("button", { name: "Pilot Agreement" }));

    const log = screen.getByRole("log");
    expect(within(log).getByText(/let's put together a Pilot Agreement/i)).toBeInTheDocument();
  });

  it("sends the chosen document with the next message", async () => {
    sendChat.mockResolvedValue(turn("Noted.", "pilot-agreement"));
    render(<DocumentCreator />);

    await userEvent.click(screen.getByRole("button", { name: "Pilot Agreement" }));
    await say("Initech and Umbrella");

    await waitFor(() => expect(sendChat).toHaveBeenCalled());
    const [, values] = sendChat.mock.calls[0];
    expect(values.documentType).toBe("pilot-agreement");
  });
});

describe("the conversation", () => {
  it("adopts the document the assistant settles on", async () => {
    sendChat.mockResolvedValue(
      turn("An SLA it is. What uptime?", "service-level-agreement"),
    );
    render(<DocumentCreator />);

    await say("I need uptime commitments for my cloud product");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Service Level Agreement" }),
    ).toBeInTheDocument();
  });

  it("shows an unsupported request's answer without picking a document", async () => {
    // The ticket's requirement: say plainly we cannot draft it, offer the
    // closest thing. Nothing should be selected on the strength of a refusal.
    sendChat.mockResolvedValue(
      turn(
        "I can't draft an employment contract. The closest is a Professional " +
          "Services Agreement — would that work?",
      ),
    );
    render(<DocumentCreator />);

    await say("I need an employment contract");

    expect(await screen.findByText(/can't draft an employment contract/i)).toBeInTheDocument();
    expect(screen.getByText(/no agreement chosen yet/i)).toBeInTheDocument();
  });

  it("fills the preview in from the values the assistant returns", async () => {
    sendChat.mockResolvedValue(
      turn("Noted 99.9%.", "service-level-agreement", { targetUptime: "99.9%" }),
    );
    render(<DocumentCreator />);

    await say("99.9% uptime");

    const preview = await screen.findByLabelText(/agreement preview/i);
    await waitFor(() => expect(within(preview).getByText("99.9%")).toBeInTheDocument());
  });

  it("keeps the transcript in order", async () => {
    sendChat.mockResolvedValue(turn("Got it.", "mutual-nda"));
    render(<DocumentCreator />);

    await say("A mutual NDA please");

    const log = screen.getByRole("log");
    await waitFor(() => expect(within(log).getByText("Got it.")).toBeInTheDocument());
    expect(within(log).getByText("A mutual NDA please")).toBeInTheDocument();
  });

  it("sends the values it already holds with each turn", async () => {
    // The backend is stateless: it only knows what the browser sends.
    sendChat
      .mockResolvedValueOnce(
        turn("Noted.", "service-level-agreement", { targetUptime: "99.9%" }),
      )
      .mockResolvedValueOnce(
        turn("Noted.", "service-level-agreement", {
          targetUptime: "99.9%",
          supportChannel: "support@acme.io",
        }),
      );
    render(<DocumentCreator />);

    await say("99.9% uptime");
    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1));
    await say("support@acme.io");

    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(2));
    const [, values] = sendChat.mock.calls[1];
    expect(values.fields.targetUptime).toBe("99.9%");
  });

  it("reports a failure beside the message instead of impersonating the assistant", async () => {
    sendChat.mockRejectedValue(new ChatError("The assistant is not configured."));
    render(<DocumentCreator />);

    await say("hello");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The assistant is not configured.",
    );
  });

  it("keeps the user's message visible after a failure", async () => {
    sendChat.mockRejectedValue(new ChatError("nope"));
    render(<DocumentCreator />);

    await say("my message");

    await screen.findByRole("alert");
    expect(within(screen.getByRole("log")).getByText("my message")).toBeInTheDocument();
  });
});

describe("once an agreement is under way", () => {
  it("offers the download", async () => {
    sendChat.mockResolvedValue(turn("Ready.", "mutual-nda"));
    render(<DocumentCreator />);

    await say("a mutual NDA");

    expect(
      await screen.findByRole("button", { name: /download pdf/i }),
    ).toBeInTheDocument();
  });

  it("states a document's known limits up front", async () => {
    // A PSA supports one statement of work; someone about to sign should know.
    sendChat.mockResolvedValue(
      turn("Right.", "professional-services-agreement"),
    );
    render(<DocumentCreator />);

    await say("professional services");

    expect(await screen.findByText(/one statement of work/i)).toBeInTheDocument();
  });

  it("shows no limitation notice for an agreement without one", async () => {
    sendChat.mockResolvedValue(turn("Right.", "mutual-nda"));
    render(<DocumentCreator />);

    await say("a mutual NDA");

    await screen.findByRole("heading", { level: 1, name: /mutual non-disclosure/i });
    expect(screen.queryByText(/one statement of work/i)).not.toBeInTheDocument();
  });

  it("credits the source the agreement actually came from", async () => {
    sendChat.mockResolvedValue(turn("Right.", "pilot-agreement"));
    render(<DocumentCreator />);

    await say("a pilot");

    expect(
      await screen.findByText(/Based on the Common Paper Pilot Agreement/i),
    ).toBeInTheDocument();
  });
});

describe("saving", () => {
  it("keeps the agreement under a title built from the parties", async () => {
    // Six saved drafts all called "Mutual Non-Disclosure Agreement" would be
    // useless to tell apart.
    sendChat.mockResolvedValue({
      reply: "Noted.",
      values: {
        ...emptyValues("mutual-nda"),
        parties: [
          { company: "Acme Ltd", printName: "", title: "", noticeAddress: "" },
          { company: "Globex Inc", printName: "", title: "", noticeAddress: "" },
        ],
      },
    });
    render(<DocumentCreator />);

    await say("a mutual NDA between Acme and Globex");
    await userEvent.click(
      await screen.findByRole("button", { name: /save to my documents/i }),
    );

    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    const [slug, title] = saveDraft.mock.calls[0];
    expect(slug).toBe("mutual-nda");
    expect(title).toContain("Acme Ltd");
    expect(title).toContain("Globex Inc");
  });

  it("confirms the save and points at the list", async () => {
    sendChat.mockResolvedValue(turn("Ready.", "mutual-nda"));
    render(<DocumentCreator />);

    await say("a mutual NDA");
    await userEvent.click(
      await screen.findByRole("button", { name: /save to my documents/i }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(
      screen.getByRole("link", { name: /view my documents/i }),
    ).toBeInTheDocument();
  });

  it("reports a failed save rather than pretending it worked", async () => {
    saveDraft.mockRejectedValue(new Error("Could not reach the server."));
    sendChat.mockResolvedValue(turn("Ready.", "mutual-nda"));
    render(<DocumentCreator />);

    await say("a mutual NDA");
    await userEvent.click(
      await screen.findByRole("button", { name: /save to my documents/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server.",
    );
  });

  it("offers nothing to save before a document is chosen", () => {
    render(<DocumentCreator />);
    expect(
      screen.queryByRole("button", { name: /save to my documents/i }),
    ).not.toBeInTheDocument();
  });
});

describe("reopening a saved document", () => {
  it("loads the saved answers when opened with ?draft=", async () => {
    window.history.replaceState({}, "", "/app?draft=7");
    readDraft.mockResolvedValue({
      id: 7,
      documentType: "service-level-agreement",
      title: "SLA — Acme",
      createdAt: "2026-09-03 10:00:00",
      updatedAt: "2026-09-03 10:00:00",
      values: {
        ...emptyValues("service-level-agreement"),
        fields: { targetUptime: "99.95%" },
      },
    });

    render(<DocumentCreator />);

    await waitFor(() => expect(readDraft).toHaveBeenCalledWith(7));
    const preview = await screen.findByLabelText(/agreement preview/i);
    await waitFor(() =>
      expect(within(preview).getByText("99.95%")).toBeInTheDocument(),
    );
  });

  it("ignores a nonsense draft id rather than asking for it", () => {
    window.history.replaceState({}, "", "/app?draft=not-a-number");
    render(<DocumentCreator />);
    expect(readDraft).not.toHaveBeenCalled();
  });

  it("says so when a saved document cannot be opened", async () => {
    window.history.replaceState({}, "", "/app?draft=7");
    readDraft.mockRejectedValue(new Error("No such document."));

    render(<DocumentCreator />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be opened/i,
    );
  });
});

describe("the draft disclaimer", () => {
  it("sits above the agreement, not in fine print below it", async () => {
    sendChat.mockResolvedValue(turn("Ready.", "mutual-nda"));
    render(<DocumentCreator />);

    await say("a mutual NDA");

    expect(await screen.findByText(/this is a draft/i)).toBeInTheDocument();
    expect(screen.getByText(/subject to\s+review by a qualified lawyer/i)).toBeInTheDocument();
  });
});

describe("a session that expires mid-use", () => {
  it("sends the user back to sign in rather than showing an error", async () => {
    // The database is rebuilt on restart, so a session can vanish under a user
    // who is in the middle of drafting.
    sendChat.mockRejectedValue(new ApiError("Sign in to continue.", 401));
    render(<DocumentCreator />);

    await say("hello");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
