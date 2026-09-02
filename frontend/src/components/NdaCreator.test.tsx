/**
 * Integration test for the whole tool: what the assistant reports must show up
 * in the rendered agreement. This is the wiring the unit tests cannot cover --
 * before PL-5 the same test drove the cover-page form instead of the chat.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NdaCreator } from "./NdaCreator";
import { emptyFormValues, type NdaFormValues } from "@/lib/form";

const sendChat = vi.fn();

vi.mock("@react-pdf/renderer", () => ({ pdf: () => ({ toBlob: vi.fn() }) }));
vi.mock("@/pdf/NdaDocument", () => ({ NdaPdfDocument: () => null }));
vi.mock("@/lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat")>();
  return { ...actual, sendChat: (...args: unknown[]) => sendChat(...args) };
});

const preview = () => screen.getByRole("region", { name: /agreement preview/i });

/** Makes the assistant answer once with the given cover page. */
function assistantReports(fields: Partial<NdaFormValues>, reply = "Noted.") {
  sendChat.mockResolvedValue({ reply, fields: { ...emptyFormValues(), ...fields } });
}

async function say(text: string) {
  await userEvent.type(screen.getByLabelText(/message the assistant/i), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

beforeEach(() => {
  sendChat.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Mutual NDA creator", () => {
  it("renders the conversation and the preview side by side", () => {
    render(<NdaCreator />);
    expect(
      screen.getByRole("heading", { name: /mutual nda creator/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("log", { name: /conversation/i })).toBeInTheDocument();
    expect(
      within(preview()).getByRole("heading", { name: "Mutual Non-Disclosure Agreement" }),
    ).toBeInTheDocument();
  });

  it("shows the standard terms in the preview from first load", () => {
    render(<NdaCreator />);
    expect(
      within(preview()).getByRole("heading", { name: "Standard Terms" }),
    ).toBeInTheDocument();
  });

  it("puts a governing law reported by the assistant into the agreement", async () => {
    assistantReports({ governingLaw: "Delaware" });
    render(<NdaCreator />);

    await say("Delaware law");

    await waitFor(() =>
      expect(within(preview()).getByText("Delaware")).toBeInTheDocument(),
    );
  });

  it("puts reported company names into the signature block", async () => {
    assistantReports({
      partyOne: {
        company: "Acme, Inc.",
        printName: "",
        title: "",
        noticeAddress: "",
      },
      partyTwo: {
        company: "Globex Corporation",
        printName: "",
        title: "",
        noticeAddress: "",
      },
    });
    render(<NdaCreator />);

    await say("Acme and Globex");

    await waitFor(() => {
      const table = within(preview()).getByRole("table");
      expect(
        within(table).getByRole("columnheader", { name: "Acme, Inc." }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole("columnheader", { name: "Globex Corporation" }),
      ).toBeInTheDocument();
    });
  });

  it("reflects a change of term choice in the checked option", async () => {
    render(<NdaCreator />);
    expect(within(preview()).getAllByText("[x]").length).toBe(2);

    assistantReports({ mndaTerm: "untilTerminated" });
    await say("no fixed end date");

    // Still two checked boxes -- one per section -- but now a different one.
    await waitFor(() =>
      expect(
        within(preview()).getByText(/continues until terminated/i),
      ).toBeInTheDocument(),
    );
    expect(within(preview()).getAllByText("[x]").length).toBe(2);
  });

  it("adds the modifications section only once the assistant reports one", async () => {
    render(<NdaCreator />);
    expect(
      within(preview()).queryByRole("heading", { name: "MNDA Modifications" }),
    ).not.toBeInTheDocument();

    assistantReports({ modifications: "Section 5 deleted." });
    await say("please delete section 5");

    await waitFor(() =>
      expect(
        within(preview()).getByRole("heading", { name: "MNDA Modifications" }),
      ).toBeInTheDocument(),
    );
    expect(within(preview()).getByText("Section 5 deleted.")).toBeInTheDocument();
  });

  it("offers the download control", () => {
    render(<NdaCreator />);
    expect(
      screen.getByRole("button", { name: /download pdf/i }),
    ).toBeInTheDocument();
  });

  it("credits Common Paper and links the CC BY licence", () => {
    render(<NdaCreator />);
    const link = screen.getAllByRole("link", { name: /cc by 4\.0/i })[0];
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("creativecommons.org"),
    );
  });
});
