import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentChat } from "./DocumentChat";
import { documentFixture } from "@/lib/fixtures";
import { emptyValues } from "@/lib/values";
import type { ChatMessage } from "@/lib/chat";

const mnda = documentFixture("mutual-nda");

const transcript: ChatMessage[] = [
  { role: "assistant", content: "What are you looking to draft?" },
  { role: "user", content: "A mutual NDA" },
];

function setup(overrides: Partial<Parameters<typeof DocumentChat>[0]> = {}) {
  const onSend = vi.fn();
  render(
    <DocumentChat
      messages={transcript}
      values={emptyValues("mutual-nda")}
      document={mnda}
      pending={false}
      error={null}
      onSend={onSend}
      {...overrides}
    />,
  );
  return { onSend };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("DocumentChat", () => {
  it("shows the whole transcript", () => {
    setup();
    const log = screen.getByRole("log");

    expect(within(log).getByText("What are you looking to draft?")).toBeInTheDocument();
    expect(within(log).getByText("A mutual NDA")).toBeInTheDocument();
  });

  it("says who spoke, for a screen reader", () => {
    setup();
    expect(screen.getByText("You said:")).toBeInTheDocument();
    expect(screen.getAllByText("Assistant said:").length).toBeGreaterThan(0);
  });

  it("sends what the user typed", async () => {
    const { onSend } = setup();

    await userEvent.type(screen.getByLabelText(/message the assistant/i), "Delaware");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("Delaware");
  });

  it("clears the box after sending", async () => {
    setup();
    const input = screen.getByLabelText(/message the assistant/i);

    await userEvent.type(input, "Delaware");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(input).toHaveValue("");
  });

  it("will not send an empty or whitespace-only message", async () => {
    const { onSend } = setup();

    await userEvent.type(screen.getByLabelText(/message the assistant/i), "   ");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("locks the input while a turn is in flight", () => {
    setup({ pending: true });

    expect(screen.getByLabelText(/message the assistant/i)).toBeDisabled();
    expect(screen.getByText(/assistant is typing/i)).toBeInTheDocument();
  });

  it("shows an error as an alert", () => {
    setup({ error: "Could not reach the assistant." });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not reach the assistant.",
    );
  });

  it("lists what has been captured once there is something", async () => {
    const values = emptyValues("mutual-nda");
    values.fields.governingLaw = "Delaware";
    setup({ values });

    await userEvent.click(screen.getByText(/captured so far/i));
    expect(screen.getByText("Governing Law")).toBeInTheDocument();
    expect(screen.getByText("Delaware")).toBeInTheDocument();
  });

  it("shows no captured list while nothing has been answered", () => {
    // A wall of blank rows would recreate the form this product does not have.
    setup();
    expect(screen.queryByText(/captured so far/i)).not.toBeInTheDocument();
  });

  it("shows no captured list before a document is chosen", () => {
    setup({ document: undefined, values: emptyValues() });
    expect(screen.queryByText(/captured so far/i)).not.toBeInTheDocument();
  });
});
