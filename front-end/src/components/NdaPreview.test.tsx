import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NdaPreview } from "./NdaPreview";
import type { NdaDocument } from "@/lib/document";
import { assembleDocument } from "@/lib/assemble";
import { defaultFormValues } from "@/lib/form";

function doc(blocks: NdaDocument["blocks"]): NdaDocument {
  return { blocks };
}

describe("NdaPreview", () => {
  it("renders a title as a heading", () => {
    render(<NdaPreview document={doc([{ kind: "title", text: "Standard Terms" }])} />);
    expect(screen.getByRole("heading", { name: "Standard Terms" })).toBeInTheDocument();
  });

  it("renders a clause with its number", () => {
    render(
      <NdaPreview
        document={doc([
          {
            kind: "clause",
            number: 7,
            content: [{ kind: "strong", text: "Proprietary Rights" }],
          },
        ])}
      />,
    );
    expect(screen.getByText("7.")).toBeInTheDocument();
    expect(screen.getByText("Proprietary Rights")).toBeInTheDocument();
  });

  it("renders a link with its href and opens it safely", () => {
    render(
      <NdaPreview
        document={doc([
          {
            kind: "paragraph",
            content: [{ kind: "link", text: "CC BY 4.0", href: "https://example.com" }],
          },
        ])}
      />,
    );
    const link = screen.getByRole("link", { name: "CC BY 4.0" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("marks a checked option with [x] and an unchecked one with [ ]", () => {
    render(
      <NdaPreview
        document={doc([
          { kind: "option", checked: true, content: [{ kind: "text", text: "Chosen" }] },
          { kind: "option", checked: false, content: [{ kind: "text", text: "Other" }] },
        ])}
      />,
    );
    expect(screen.getByText("[x]")).toBeInTheDocument();
    expect(screen.getByText("[ ]")).toBeInTheDocument();
  });

  it("renders a cover-page reference as text, not as an input", () => {
    render(
      <NdaPreview
        document={doc([
          {
            kind: "paragraph",
            content: [{ kind: "reference", text: "Governing Law" }],
          },
        ])}
      />,
    );
    expect(screen.getByText("Governing Law")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders the signature block as a table with both party columns", () => {
    render(
      <NdaPreview
        document={doc([
          {
            kind: "signatures",
            parties: ["Acme, Inc.", "Globex Corporation"],
            rows: [
              { label: "Signature", values: ["", ""] },
              { label: "Print Name", values: ["Jordan Lee", "Sam Rivera"] },
            ],
          },
        ])}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Acme, Inc." })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Globex Corporation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
  });

  it("renders an empty document without crashing", () => {
    const { container } = render(<NdaPreview document={doc([])} />);
    expect(container).toBeInTheDocument();
  });

  it("renders a full assembled document including cover page and terms", () => {
    render(<NdaPreview document={assembleDocument(defaultFormValues())} />);
    expect(
      screen.getByRole("heading", { name: "Mutual Non-Disclosure Agreement" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Standard Terms" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("escapes rather than interprets HTML in user values", () => {
    render(
      <NdaPreview
        document={doc([
          {
            kind: "paragraph",
            content: [
              { kind: "value", text: "<img src=x onerror=alert(1)>", filled: true },
            ],
          },
        ])}
      />,
    );
    // React escapes by default; assert no element was actually created.
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  });
});
