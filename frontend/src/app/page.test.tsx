/**
 * The fake sign-in screen. What matters is that it takes anyone through to the
 * platform, remembers who they said they were, and does not pretend to be a
 * security boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignIn from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

beforeEach(() => {
  replace.mockClear();
});

afterEach(() => {
  window.localStorage.clear();
});

async function signIn(name: string, email: string) {
  await userEvent.type(screen.getByLabelText("Full name"), name);
  await userEvent.type(screen.getByLabelText("Work email"), email);
  await userEvent.click(screen.getByRole("button", { name: /continue to prelegal/i }));
}

describe("sign-in screen", () => {
  it("asks who the user is", () => {
    render(<SignIn />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
  });

  it("says plainly that nothing is being authenticated", () => {
    render(<SignIn />);
    expect(screen.getByText(/placeholder sign-in/i)).toBeInTheDocument();
    expect(screen.getByText(/no password is checked/i)).toBeInTheDocument();
  });

  it("starts a session and moves to the platform", async () => {
    render(<SignIn />);
    await signIn("Ada Lovelace", "ada@acme.com");

    expect(JSON.parse(window.localStorage.getItem("prelegal.session")!)).toEqual({
      name: "Ada Lovelace",
      email: "ada@acme.com",
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
  });

  it("trims stray whitespace out of what was typed", async () => {
    render(<SignIn />);
    await signIn("  Ada Lovelace  ", "  ada@acme.com  ");

    expect(JSON.parse(window.localStorage.getItem("prelegal.session")!)).toEqual({
      name: "Ada Lovelace",
      email: "ada@acme.com",
    });
  });

  it("does not submit without a name and an email", async () => {
    render(<SignIn />);
    await userEvent.click(screen.getByRole("button", { name: /continue to prelegal/i }));

    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("prelegal.session")).toBeNull();
  });

  it("sends an already signed-in visitor straight through", async () => {
    window.localStorage.setItem(
      "prelegal.session",
      JSON.stringify({ name: "Ada Lovelace", email: "ada@acme.com" }),
    );
    render(<SignIn />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
  });
});
