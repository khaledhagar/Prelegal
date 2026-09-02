/**
 * The signed-in shell: it must greet the right person, let them out, and keep
 * signed-out visitors from seeing the product chrome at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./AppShell";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

function signedIn() {
  window.localStorage.setItem(
    "prelegal.session",
    JSON.stringify({ name: "Ada Lovelace", email: "ada@acme.com" }),
  );
}

beforeEach(() => {
  replace.mockClear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("AppShell", () => {
  it("shows the product chrome and its content to a signed-in user", () => {
    signedIn();
    render(
      <AppShell>
        <p>Tool goes here</p>
      </AppShell>,
    );

    expect(screen.getByLabelText("Prelegal")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Tool goes here")).toBeInTheDocument();
  });

  it("sends a signed-out visitor back to the login screen", async () => {
    render(
      <AppShell>
        <p>Tool goes here</p>
      </AppShell>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("shows nothing to a signed-out visitor while the redirect happens", () => {
    render(
      <AppShell>
        <p>Tool goes here</p>
      </AppShell>,
    );

    expect(screen.queryByText("Tool goes here")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("drops the session and redirects when signing out", async () => {
    signedIn();
    render(
      <AppShell>
        <p>Tool goes here</p>
      </AppShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(window.localStorage.getItem("prelegal.session")).toBeNull();
    expect(screen.queryByText("Tool goes here")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
