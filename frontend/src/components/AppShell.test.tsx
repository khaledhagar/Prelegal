import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const signOut = vi.fn();
let pathname = "/app";
let sessionState: {
  session: { id: number; name: string; email: string } | null;
  hydrated: boolean;
} = { session: null, hydrated: true };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => pathname,
}));

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    useSession: () => sessionState,
    signOut: () => signOut(),
  };
});

import { AppShell } from "./AppShell";

const ADA = { id: 1, name: "Ada Lovelace", email: "ada@acme.com" };

beforeEach(() => {
  replace.mockReset();
  signOut.mockReset().mockResolvedValue(undefined);
  pathname = "/app";
  sessionState = { session: ADA, hydrated: true };
});

describe("AppShell", () => {
  it("shows the product chrome and its content to a signed-in user", () => {
    render(
      <AppShell>
        <p>workspace</p>
      </AppShell>,
    );

    expect(screen.getByText("workspace")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@acme.com")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("sends a signed-out visitor back to the sign-in screen", () => {
    sessionState = { session: null, hydrated: true };

    render(
      <AppShell>
        <p>workspace</p>
      </AppShell>,
    );

    expect(replace).toHaveBeenCalledWith("/");
  });

  it("shows nothing to a signed-out visitor while the redirect happens", () => {
    sessionState = { session: null, hydrated: true };

    render(
      <AppShell>
        <p>workspace</p>
      </AppShell>,
    );

    expect(screen.queryByText("workspace")).not.toBeInTheDocument();
  });

  it("waits for the session to be known before redirecting", () => {
    sessionState = { session: null, hydrated: false };

    render(
      <AppShell>
        <p>workspace</p>
      </AppShell>,
    );

    expect(replace).not.toHaveBeenCalled();
  });

  it("signs out through the backend, then redirects", async () => {
    // Clearing the cookie without telling the server would leave a token that
    // still works for anyone holding a copy.
    render(
      <AppShell>
        <p>workspace</p>
      </AppShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/");
  });
});

describe("navigation", () => {
  it("links to the drafter and to saved documents", () => {
    render(
      <AppShell>
        <p>workspace</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Draft" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: "My documents" })).toHaveAttribute(
      "href",
      "/app/documents",
    );
  });

  it("marks the drafter as current on the drafter", () => {
    render(
      <AppShell>
        <p>workspace</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Draft" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "My documents" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks only saved documents as current on that page", () => {
    // "/app/documents" also starts with "/app", so a prefix match would light
    // up both tabs at once.
    pathname = "/app/documents";

    render(
      <AppShell>
        <p>saved</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: "My documents" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Draft" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("the disclaimer", () => {
  it("is present on every signed-in screen", () => {
    // It lives in the shell rather than on one page so no route can forget it.
    render(
      <AppShell>
        <p>workspace</p>
      </AppShell>,
    );

    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
    expect(screen.getByText(/qualified lawyer/i)).toBeInTheDocument();
  });
});
