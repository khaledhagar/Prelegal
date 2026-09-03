import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentPicker } from "./DocumentPicker";
import { allDocuments } from "@/lib/documents/registry";

describe("DocumentPicker", () => {
  it("lists every agreement the product can draft", () => {
    render(<DocumentPicker selected="" onSelect={vi.fn()} />);

    for (const document of allDocuments) {
      expect(screen.getByRole("button", { name: document.name })).toBeInTheDocument();
    }
  });

  it("marks the chosen agreement as current", () => {
    render(<DocumentPicker selected="service-level-agreement" onSelect={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Service Level Agreement" }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Pilot Agreement" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("reports the slug when one is chosen", async () => {
    const onSelect = vi.fn();
    render(<DocumentPicker selected="" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: "Pilot Agreement" }));

    expect(onSelect).toHaveBeenCalledWith("pilot-agreement");
  });

  it("describes each agreement for anyone unsure which they need", () => {
    render(<DocumentPicker selected="" onSelect={vi.fn()} />);
    const sla = allDocuments.find(
      (document) => document.slug === "service-level-agreement",
    );

    expect(
      screen.getByRole("button", { name: "Service Level Agreement" }),
    ).toHaveAttribute("title", sla?.description);
  });
});
