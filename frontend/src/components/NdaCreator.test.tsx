/**
 * Integration test for the whole tool: typing in the form must change the
 * rendered agreement. This is the wiring the unit tests cannot cover.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NdaCreator } from "./NdaCreator";

vi.mock("@react-pdf/renderer", () => ({ pdf: () => ({ toBlob: vi.fn() }) }));
vi.mock("@/pdf/NdaDocument", () => ({ NdaPdfDocument: () => null }));

const preview = () => screen.getByRole("region", { name: /agreement preview/i });

describe("Mutual NDA creator", () => {
  it("renders the form and the preview side by side", () => {
    render(<NdaCreator />);
    expect(screen.getByRole("heading", { name: /mutual nda creator/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Governing law")).toBeInTheDocument();
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

  it("reflects a typed governing law in the agreement", async () => {
    render(<NdaCreator />);
    await userEvent.type(screen.getByLabelText("Governing law"), "Delaware");
    expect(within(preview()).getByText("Delaware")).toBeInTheDocument();
  });

  it("reflects typed company names in the signature block", async () => {
    render(<NdaCreator />);
    const companies = screen.getAllByLabelText("Company");
    await userEvent.type(companies[0], "Acme, Inc.");
    await userEvent.type(companies[1], "Globex Corporation");

    const table = within(preview()).getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Acme, Inc." }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Globex Corporation" }),
    ).toBeInTheDocument();
  });

  it("updates the checked option when the term choice changes", async () => {
    render(<NdaCreator />);
    expect(within(preview()).getAllByText("[x]").length).toBe(2);

    await userEvent.click(
      screen.getByRole("radio", { name: /continues until terminated/i }),
    );
    // Still two checked boxes -- one per section -- but now a different one.
    expect(within(preview()).getAllByText("[x]").length).toBe(2);
    expect(
      within(preview()).getByText(/continues until terminated/i),
    ).toBeInTheDocument();
  });

  it("adds the modifications section to the agreement only once filled", async () => {
    render(<NdaCreator />);
    expect(
      within(preview()).queryByRole("heading", { name: "MNDA Modifications" }),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText("MNDA modifications"),
      "Section 5 deleted.",
    );
    expect(
      within(preview()).getByRole("heading", { name: "MNDA Modifications" }),
    ).toBeInTheDocument();
    expect(within(preview()).getByText("Section 5 deleted.")).toBeInTheDocument();
  });

  it("offers the download control", () => {
    render(<NdaCreator />);
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
  });

  it("states that data stays in the browser", () => {
    render(<NdaCreator />);
    expect(screen.getByText(/nothing is uploaded/i)).toBeInTheDocument();
  });

  it("credits Common Paper and links the CC BY licence", () => {
    render(<NdaCreator />);
    const link = screen.getAllByRole("link", { name: /cc by 4\.0/i })[0];
    expect(link).toHaveAttribute("href", expect.stringContaining("creativecommons.org"));
  });
});
