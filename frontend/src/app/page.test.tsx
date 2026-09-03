/**
 * The sign-in / sign-up screen.
 *
 * The session module is stubbed: what is under test is the form's behaviour —
 * which call it makes, what it does with a refusal — not the transport, which
 * src/lib/session.test.tsx covers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const signIn = vi.fn();
const signUp = vi.fn();
const requestPasswordReset = vi.fn();
let sessionState: { session: unknown; hydrated: boolean } = {
  session: null,
  hydrated: true,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    useSession: () => sessionState,
    signIn: (...args: unknown[]) => signIn(...args),
    signUp: (...args: unknown[]) => signUp(...args),
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  };
});

import SignInPage from "./page";

async function fill(label: RegExp, value: string) {
  await userEvent.type(screen.getByLabelText(label), value);
}

beforeEach(() => {
  replace.mockReset();
  signIn.mockReset().mockResolvedValue({ id: 1, name: "Ada", email: "a@b.com" });
  signUp.mockReset().mockResolvedValue({ id: 1, name: "Ada", email: "a@b.com" });
  sessionState = { session: null, hydrated: true };
  requestPasswordReset
    .mockReset()
    .mockResolvedValue(
      "If that address has an account, a password reset link has been created.",
    );
});

describe("signing in", () => {
  it("asks for an email and a password", () => {
    render(<SignInPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    // Signing in needs no name; only registering does.
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
  });

  it("hides the password as it is typed", () => {
    render(<SignInPage />);
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
  });

  it("signs in and moves to the platform", async () => {
    render(<SignInPage />);

    await fill(/email/i, "ada@acme.com");
    await fill(/password/i, "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: "ada@acme.com",
        password: "correct-horse",
      }),
    );
    expect(replace).toHaveBeenCalledWith("/app");
  });

  it("trims stray whitespace out of the email", async () => {
    render(<SignInPage />);

    await fill(/email/i, "  ada@acme.com  ");
    await fill(/password/i, "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() =>
      expect(signIn.mock.calls[0][0].email).toBe("ada@acme.com"),
    );
  });

  it("does not trim the password", async () => {
    // Spaces can be part of a passphrase; silently removing them would lock
    // someone out of an account they typed correctly.
    render(<SignInPage />);

    await fill(/email/i, "ada@acme.com");
    await fill(/password/i, " has spaces ");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() =>
      expect(signIn.mock.calls[0][0].password).toBe(" has spaces "),
    );
  });

  it("shows the backend's refusal without guessing at it", async () => {
    signIn.mockRejectedValue(new Error("Email or password is incorrect."));
    render(<SignInPage />);

    await fill(/email/i, "ada@acme.com");
    await fill(/password/i, "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("lets the user try again after a refusal", async () => {
    signIn.mockRejectedValueOnce(new Error("Email or password is incorrect."));
    render(<SignInPage />);

    await fill(/email/i, "ada@acme.com");
    await fill(/password/i, "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await screen.findByRole("alert");

    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });
});

describe("creating an account", () => {
  async function switchToSignUp() {
    await userEvent.click(screen.getByRole("tab", { name: /create account/i }));
  }

  it("also asks for a name", async () => {
    render(<SignInPage />);
    await switchToSignUp();

    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
  });

  it("registers and moves to the platform", async () => {
    render(<SignInPage />);
    await switchToSignUp();

    await fill(/your name/i, "Ada Lovelace");
    await fill(/email/i, "ada@acme.com");
    await fill(/password/i, "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        name: "Ada Lovelace",
        email: "ada@acme.com",
        password: "correct-horse",
      }),
    );
    expect(replace).toHaveBeenCalledWith("/app");
  });

  it("says when the email is already taken", async () => {
    signUp.mockRejectedValue(
      new Error("That email already has an account. Sign in instead."),
    );
    render(<SignInPage />);
    await switchToSignUp();

    await fill(/your name/i, "Ada");
    await fill(/email/i, "ada@acme.com");
    await fill(/password/i, "correct-horse");
    await userEvent.click(
      screen.getByRole("button", { name: /create account/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already has an account",
    );
  });

  it("clears a previous error when switching mode", async () => {
    signIn.mockRejectedValue(new Error("Email or password is incorrect."));
    render(<SignInPage />);

    await fill(/email/i, "ada@acme.com");
    await fill(/password/i, "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await screen.findByRole("alert");

    await switchToSignUp();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the screen itself", () => {
  it("sends an already signed-in visitor straight through", () => {
    sessionState = {
      session: { id: 1, name: "Ada", email: "ada@acme.com" },
      hydrated: true,
    };

    render(<SignInPage />);

    expect(replace).toHaveBeenCalledWith("/app");
  });

  it("waits for the session to be known before redirecting", () => {
    // Redirecting on an unknown session would bounce a signed-in user on every
    // page load.
    sessionState = { session: null, hydrated: false };

    render(<SignInPage />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("does not warn that accounts are temporary, because they are not", () => {
    // This screen used to carry a demo notice, correctly, while the database
    // was rebuilt on every start. Storage is durable now, so the notice would
    // be a lie -- and telling someone their saved contract is about to vanish
    // is not a harmless thing to leave lying around.
    render(<SignInPage />);

    expect(screen.queryByText(/until the server restarts/i)).toBeNull();
    expect(screen.queryByText(/demo deployment/i)).toBeNull();
    expect(screen.queryByText(/wiped/i)).toBeNull();
  });

  it("states that the product produces drafts, not legal advice", () => {
    render(<SignInPage />);
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });
});


describe("forgetting a password", () => {
  async function openTheResetForm() {
    render(<SignInPage />);
    await userEvent.click(screen.getByRole("button", { name: /forgot password/i }));
  }

  it("is reachable from the sign-in form", async () => {
    render(<SignInPage />);
    expect(
      screen.getByRole("button", { name: /forgot password/i }),
    ).toBeInTheDocument();
  });

  it("is not offered while creating an account", async () => {
    render(<SignInPage />);
    await userEvent.click(screen.getByRole("tab", { name: /create account/i }));

    expect(screen.queryByRole("button", { name: /forgot password/i })).toBeNull();
  });

  it("asks for an email and nothing else", async () => {
    await openTheResetForm();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    // A password would be meaningless here -- that is the thing being reset.
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it("requests the reset for the address given", async () => {
    await openTheResetForm();

    await fill(/email/i, "ada@acme.com");
    await userEvent.click(screen.getByRole("button", { name: /create a reset link/i }));

    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith("ada@acme.com"),
    );
  });

  it("shows what the server said, as a status rather than an error", async () => {
    await openTheResetForm();

    await fill(/email/i, "ada@acme.com");
    await userEvent.click(screen.getByRole("button", { name: /create a reset link/i }));

    // The wording is deliberately non-committal about whether the account
    // exists, so it must not be dressed up as either success or failure.
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/if that address has an account/i);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not sign anyone in", async () => {
    await openTheResetForm();

    await fill(/email/i, "ada@acme.com");
    await userEvent.click(screen.getByRole("button", { name: /create a reset link/i }));

    await screen.findByRole("status");
    expect(signIn).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a way back to signing in", async () => {
    await openTheResetForm();
    await userEvent.click(screen.getByRole("button", { name: /back to sign in/i }));

    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });
});
