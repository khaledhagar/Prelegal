/**
 * The conversation panel.
 *
 * `sendChat` is mocked throughout -- these tests are about what the user sees:
 * their message appearing, the reply arriving, the captured values updating,
 * and a failure being survivable rather than fatal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NdaChat } from "./NdaChat";
import { emptyFormValues, type NdaFormValues } from "@/lib/form";
import { ChatError } from "@/lib/chat";

const sendChat = vi.fn();

vi.mock("@/lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat")>();
  return { ...actual, sendChat: (...args: unknown[]) => sendChat(...args) };
});

function setup(values: NdaFormValues = emptyFormValues()) {
  const onValuesChange = vi.fn();
  render(<NdaChat values={values} onValuesChange={onValuesChange} />);
  return { onValuesChange };
}

async function say(text: string) {
  await userEvent.type(screen.getByLabelText(/message the assistant/i), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

beforeEach(() => {
  sendChat.mockReset();
  // jsdom has no layout, so scrollIntoView is not implemented on elements.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NdaChat", () => {
  it("opens with a question rather than an empty box", () => {
    setup();
    expect(screen.getByRole("log")).toHaveTextContent(/which two companies/i);
  });

  it("shows the user's message and then the assistant's reply", async () => {
    sendChat.mockResolvedValue({
      reply: "Noted. Which state's law should govern?",
      fields: emptyFormValues(),
    });
    setup();

    await say("Acme and Globex");

    expect(screen.getByText("Acme and Globex")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/which state's law should govern/i)).toBeInTheDocument(),
    );
  });

  it("hands the updated agreement values to the parent", async () => {
    const fields = { ...emptyFormValues(), governingLaw: "Delaware" };
    sendChat.mockResolvedValue({ reply: "Noted.", fields });
    const { onValuesChange } = setup();

    await say("Delaware law please");

    await waitFor(() => expect(onValuesChange).toHaveBeenCalledWith(fields));
  });

  it("sends the whole transcript, not just the latest message", async () => {
    sendChat.mockResolvedValue({ reply: "Noted.", fields: emptyFormValues() });
    setup();

    await say("Acme and Globex");
    await waitFor(() => expect(sendChat).toHaveBeenCalled());

    const [sent] = sendChat.mock.calls[0];
    expect(sent).toHaveLength(2);
    expect(sent[0].role).toBe("assistant");
    expect(sent[1]).toEqual({ role: "user", content: "Acme and Globex" });
  });

  it("trims whitespace off what was typed", async () => {
    sendChat.mockResolvedValue({ reply: "Noted.", fields: emptyFormValues() });
    setup();

    await say("   Delaware   ");
    await waitFor(() => expect(sendChat).toHaveBeenCalled());

    const [sent] = sendChat.mock.calls[0];
    expect(sent[1].content).toBe("Delaware");
  });

  it("will not send an empty message", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(sendChat).not.toHaveBeenCalled();
  });

  it("says the assistant is typing while waiting", async () => {
    let release: (value: unknown) => void = () => {};
    sendChat.mockReturnValue(new Promise((resolve) => (release = resolve)));
    setup();

    await say("Acme and Globex");

    expect(screen.getByText(/assistant is typing/i)).toBeInTheDocument();
    release({ reply: "Noted.", fields: emptyFormValues() });
    await waitFor(() =>
      expect(screen.queryByText(/assistant is typing/i)).not.toBeInTheDocument(),
    );
  });

  it("shows a failure without losing the message the user sent", async () => {
    sendChat.mockRejectedValue(new ChatError("The assistant is not configured."));
    setup();

    await say("Acme and Globex");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The assistant is not configured.",
      ),
    );
    expect(screen.getByText("Acme and Globex")).toBeInTheDocument();
  });

  it("lets the user try again after a failure", async () => {
    sendChat.mockRejectedValueOnce(new ChatError("Temporarily unavailable."));
    setup();
    await say("Acme and Globex");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    sendChat.mockResolvedValue({ reply: "Back now.", fields: emptyFormValues() });
    await say("try again");

    await waitFor(() => expect(screen.getByText("Back now.")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not dress an unexpected error up as an assistant message", async () => {
    sendChat.mockRejectedValue(new TypeError("boom"));
    setup();

    await say("Acme and Globex");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i),
    );
  });

  it("lists what has been captured so far", () => {
    setup({
      ...emptyFormValues(),
      governingLaw: "Delaware",
      partyOne: {
        company: "Acme, Inc.",
        printName: "",
        title: "",
        noticeAddress: "",
      },
    });

    const captured = screen.getByText(/captured so far/i);
    expect(captured).toHaveTextContent("2");
    expect(screen.getByText("Delaware")).toBeInTheDocument();
    expect(screen.getByText("Acme, Inc.")).toBeInTheDocument();
  });

  it("shows no captured list before anything is known", () => {
    setup();
    expect(screen.queryByText(/captured so far/i)).not.toBeInTheDocument();
  });
});
