import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { NdaForm } from "./NdaForm";
import { defaultFormValues, type NdaFormValues } from "@/lib/form";

/** Wraps the controlled form in local state so interactions behave as in the app. */
function Harness({ onChange }: { onChange?: (v: NdaFormValues) => void }) {
  const [values, setValues] = useState(defaultFormValues);
  return (
    <NdaForm
      values={values}
      onChange={(next) => {
        setValues(next);
        onChange?.(next);
      }}
    />
  );
}

describe("NdaForm", () => {
  it("gives every input an accessible name", () => {
    render(<Harness />);
    // Exact matching: a loose regex for "Effective date" would also hit the
    // radio labelled "...year(s) from the effective date".
    for (const name of [
      "Purpose",
      "Effective date",
      "Governing law",
      "Jurisdiction",
      "MNDA modifications",
    ]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
  });

  it("labels the number inputs for screen readers", () => {
    render(<Harness />);
    expect(screen.getByLabelText("MNDA term in years")).toBeInTheDocument();
    expect(screen.getByLabelText("Confidentiality term in years")).toBeInTheDocument();
  });

  it("prefills the purpose from the template default", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Purpose")).toHaveValue(
      defaultFormValues().purpose,
    );
  });

  it("reports each keystroke in the governing law field", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Governing law"), "Del");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange.mock.calls.at(-1)?.[0].governingLaw).toBe("Del");
  });

  it("keeps the two parties' fields independent", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const companies = screen.getAllByLabelText("Company");
    expect(companies).toHaveLength(2);

    await userEvent.type(companies[0], "Acme");
    const afterFirst = onChange.mock.calls.at(-1)?.[0] as NdaFormValues;
    expect(afterFirst.partyOne.company).toBe("Acme");
    expect(afterFirst.partyTwo.company).toBe("");

    await userEvent.type(companies[1], "Globex");
    const afterSecond = onChange.mock.calls.at(-1)?.[0] as NdaFormValues;
    expect(afterSecond.partyOne.company).toBe("Acme");
    expect(afterSecond.partyTwo.company).toBe("Globex");
  });

  it("switches the MNDA term to until-terminated", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /continues until terminated/i }));
    expect(onChange.mock.calls.at(-1)?.[0].mndaTerm).toBe("untilTerminated");
  });

  it("switches the confidentiality term to perpetual", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /in perpetuity/i }));
    expect(onChange.mock.calls.at(-1)?.[0].confidentiality).toBe("perpetual");
  });

  it("disables the year input when its option is not selected", async () => {
    render(<Harness />);
    const years = screen.getByLabelText("MNDA term in years");
    expect(years).toBeEnabled();
    await userEvent.click(screen.getByRole("radio", { name: /continues until terminated/i }));
    expect(years).toBeDisabled();
  });

  it("re-enables the year input when the fixed option is chosen again", async () => {
    render(<Harness />);
    const years = screen.getByLabelText("Confidentiality term in years");
    await userEvent.click(screen.getByRole("radio", { name: /in perpetuity/i }));
    expect(years).toBeDisabled();
    await userEvent.click(
      screen.getByRole("radio", { name: /trade secrets excepted/i }),
    );
    expect(years).toBeEnabled();
  });

  it("keeps radio groups mutually exclusive", async () => {
    render(<Harness />);
    const fixed = screen.getByRole("radio", { name: /expires/i });
    const untilTerminated = screen.getByRole("radio", {
      name: /continues until terminated/i,
    });
    expect(fixed).toBeChecked();
    await userEvent.click(untilTerminated);
    expect(untilTerminated).toBeChecked();
    expect(fixed).not.toBeChecked();
  });

  it("does not submit or reload when Enter is pressed in a field", async () => {
    render(<Harness />);
    const field = screen.getByLabelText("Governing law");
    await userEvent.type(field, "Delaware{Enter}");
    // Still on the page with the value intact -- no navigation occurred.
    expect(field).toHaveValue("Delaware");
  });
});
