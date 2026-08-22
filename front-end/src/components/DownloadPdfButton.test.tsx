import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadPdfButton } from "./DownloadPdfButton";
import { assembleDocument } from "@/lib/assemble";
import { defaultFormValues, type NdaFormValues } from "@/lib/form";
import { filledFormValues as complete } from "@/lib/fixtures";

// The real renderer is exercised in src/pdf/NdaDocument.test.tsx. Here we care
// about the button's own behaviour: wiring, filename, errors, disabled state.
const toBlob = vi.fn();
vi.mock("@react-pdf/renderer", () => ({
  pdf: () => ({ toBlob }),
}));
vi.mock("@/pdf/NdaDocument", () => ({
  NdaPdfDocument: () => null,
}));

function setup(values: NdaFormValues) {
  return render(
    <DownloadPdfButton document={assembleDocument(values)} values={values} />,
  );
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clicked: HTMLAnchorElement[];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  toBlob.mockReset();
  toBlob.mockResolvedValue(new Blob(["%PDF-"], { type: "application/pdf" }));

  createObjectURL = vi.fn(() => "blob:mock-url");
  revokeObjectURL = vi.fn();
  // jsdom implements neither.
  Object.assign(URL, { createObjectURL, revokeObjectURL });

  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DownloadPdfButton", () => {
  it("renders an enabled download button", () => {
    setup(complete());
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeEnabled();
  });

  it("generates a blob and triggers a download on click", async () => {
    setup(complete());
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => expect(toBlob).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("names the file after both companies", async () => {
    setup(complete());
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0].download).toBe("mutual-nda-acme-inc-and-globex-corporation.pdf");
  });

  it("falls back to a generic filename when companies are blank", async () => {
    setup(defaultFormValues());
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0].download).toBe("mutual-nda.pdf");
  });

  it("removes the temporary anchor from the document", async () => {
    setup(complete());
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0].isConnected).toBe(false);
  });

  it("revokes the object URL, but only after a delay", async () => {
    setup(complete());
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(clicked).toHaveLength(1));

    // Revoking immediately can cancel the download in some browsers.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("warns about blank required fields but still allows download", async () => {
    setup(defaultFormValues());
    expect(screen.getByText(/still blank/i)).toHaveTextContent("Governing Law");
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeEnabled();
  });

  it("shows no warning when every required field is filled", () => {
    setup(complete());
    expect(screen.queryByText(/still blank/i)).not.toBeInTheDocument();
  });

  it("surfaces a generation failure as an alert instead of failing silently", async () => {
    toBlob.mockRejectedValue(new Error("font failed to load"));
    setup(complete());
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not generate the pdf/i);
    expect(alert).toHaveTextContent(/font failed to load/i);
  });

  it("re-enables the button after a failure so the user can retry", async () => {
    toBlob.mockRejectedValue(new Error("boom"));
    setup(complete());
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeEnabled();
  });

  it("clears a previous error when a later attempt succeeds", async () => {
    toBlob.mockRejectedValueOnce(new Error("boom"));
    setup(complete());
    const button = screen.getByRole("button", { name: /download pdf/i });

    await userEvent.click(button);
    await screen.findByRole("alert");

    toBlob.mockResolvedValue(new Blob(["%PDF-"], { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
