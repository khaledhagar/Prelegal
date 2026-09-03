import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listDrafts = vi.fn();
const deleteDraft = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

vi.mock("@/lib/drafts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drafts")>();
  return {
    ...actual,
    listDrafts: () => listDrafts(),
    deleteDraft: (id: number) => deleteDraft(id),
  };
});

import { SavedDocuments } from "./SavedDocuments";
import { ApiError } from "@/lib/api";

const NDA = {
  id: 1,
  documentType: "mutual-nda",
  title: "Mutual NDA — Acme & Globex",
  createdAt: "2026-09-03 10:00:00",
  updatedAt: "2026-09-03 10:45:00",
};

const SLA = {
  id: 2,
  documentType: "service-level-agreement",
  title: "SLA — Initech",
  createdAt: "2026-09-02 09:00:00",
  updatedAt: "2026-09-02 09:00:00",
};

beforeEach(() => {
  listDrafts.mockReset().mockResolvedValue([NDA, SLA]);
  deleteDraft.mockReset().mockResolvedValue(undefined);
  replace.mockReset();
});

describe("the saved list", () => {
  it("shows each saved agreement", async () => {
    render(<SavedDocuments />);

    expect(await screen.findByText(NDA.title)).toBeInTheDocument();
    expect(screen.getByText(SLA.title)).toBeInTheDocument();
  });

  it("says what kind of agreement each one is", async () => {
    render(<SavedDocuments />);

    await screen.findByText(NDA.title);
    expect(
      screen.getByText(/Mutual Non-Disclosure Agreement · saved/),
    ).toBeInTheDocument();
  });

  it("opens one back into the workspace", async () => {
    render(<SavedDocuments />);

    await screen.findByText(NDA.title);
    const open = screen.getAllByRole("link", { name: "Open" })[0];

    expect(open).toHaveAttribute("href", "/app?draft=1");
  });

  it("says so plainly when nothing is saved yet", async () => {
    listDrafts.mockResolvedValue([]);

    render(<SavedDocuments />);

    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /start a document/i }),
    ).toHaveAttribute("href", "/app");
  });

  it("shows a loading line rather than an empty state while it waits", () => {
    // An empty state that turns into a list is a worse lie than "loading".
    listDrafts.mockReturnValue(new Promise(() => {}));

    render(<SavedDocuments />);

    expect(screen.getByText(/loading your documents/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing saved yet/i)).not.toBeInTheDocument();
  });
});

describe("deleting", () => {
  it("removes the row it deleted", async () => {
    render(<SavedDocuments />);
    await screen.findByText(NDA.title);

    await userEvent.click(
      screen.getByRole("button", { name: `Delete ${NDA.title}` }),
    );

    await waitFor(() => expect(deleteDraft).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.queryByText(NDA.title)).not.toBeInTheDocument(),
    );
    // The other one is untouched.
    expect(screen.getByText(SLA.title)).toBeInTheDocument();
  });

  it("keeps the row when the delete fails", async () => {
    deleteDraft.mockRejectedValue(new Error("Could not delete that document."));
    render(<SavedDocuments />);
    await screen.findByText(NDA.title);

    await userEvent.click(
      screen.getByRole("button", { name: `Delete ${NDA.title}` }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not delete that document.",
    );
    expect(screen.getByText(NDA.title)).toBeInTheDocument();
  });

  it("names the document in the delete control, for a screen reader", async () => {
    // Six buttons all called "Delete" tell a screen-reader user nothing.
    render(<SavedDocuments />);
    await screen.findByText(NDA.title);

    expect(
      screen.getByRole("button", { name: `Delete ${SLA.title}` }),
    ).toBeInTheDocument();
  });
});

describe("failures", () => {
  it("reports a list that could not be loaded", async () => {
    listDrafts.mockRejectedValue(new Error("Could not reach the server."));

    render(<SavedDocuments />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server.",
    );
  });

  it("sends the user to sign in when the session has gone", async () => {
    listDrafts.mockRejectedValue(new ApiError("Sign in to continue.", 401));

    render(<SavedDocuments />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});

describe("the disclaimer", () => {
  it("repeats that saved documents are drafts", async () => {
    render(<SavedDocuments />);

    await screen.findByText(NDA.title);
    expect(screen.getByText(/subject to review by a qualified/i)).toBeInTheDocument();
  });
});
