"use client";

/** The cover-page form. Purely controlled -- all state lives in the parent. */
import type { ChangeEvent, ReactNode } from "react";
import type { NdaFormValues, Party } from "@/lib/form";

type Props = {
  values: NdaFormValues;
  onChange: (values: NdaFormValues) => void;
};

const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm " +
  "outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PartyFields({
  legend,
  idPrefix,
  party,
  onChange,
}: {
  legend: string;
  idPrefix: string;
  party: Party;
  onChange: (party: Party) => void;
}) {
  const set = (key: keyof Party) => (event: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...party, [key]: event.target.value });

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{legend}</legend>
      <Field label="Company" htmlFor={`${idPrefix}-company`}>
        <input
          id={`${idPrefix}-company`}
          className={fieldClass}
          value={party.company}
          onChange={set("company")}
          placeholder="Acme, Inc."
          autoComplete="organization"
        />
      </Field>
      <Field label="Print name" htmlFor={`${idPrefix}-name`}>
        <input
          id={`${idPrefix}-name`}
          className={fieldClass}
          value={party.printName}
          onChange={set("printName")}
          placeholder="Jordan Lee"
          autoComplete="name"
        />
      </Field>
      <Field label="Title" htmlFor={`${idPrefix}-title`}>
        <input
          id={`${idPrefix}-title`}
          className={fieldClass}
          value={party.title}
          onChange={set("title")}
          placeholder="Chief Executive Officer"
          autoComplete="organization-title"
        />
      </Field>
      <Field
        label="Notice address"
        hint="Email or postal address"
        htmlFor={`${idPrefix}-notice`}
      >
        <input
          id={`${idPrefix}-notice`}
          className={fieldClass}
          value={party.noticeAddress}
          onChange={set("noticeAddress")}
          placeholder="legal@acme.com"
        />
      </Field>
    </fieldset>
  );
}

export function NdaForm({ values, onChange }: Props) {
  const set = <K extends keyof NdaFormValues>(key: K, value: NdaFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
      <Section title="Agreement terms">
        <Field
          label="Purpose"
          hint="How Confidential Information may be used"
          htmlFor="purpose"
        >
          <textarea
            id="purpose"
            className={`${fieldClass} min-h-20 resize-y`}
            value={values.purpose}
            onChange={(event) => set("purpose", event.target.value)}
          />
        </Field>

        <Field label="Effective date" htmlFor="effective-date">
          <input
            id="effective-date"
            type="date"
            className={fieldClass}
            value={values.effectiveDate}
            onChange={(event) => set("effectiveDate", event.target.value)}
          />
        </Field>
      </Section>

      <Section title="MNDA term">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mnda-term"
              checked={values.mndaTerm === "fixed"}
              onChange={() => set("mndaTerm", "fixed")}
            />
            <span>Expires</span>
            <input
              type="number"
              min={1}
              aria-label="MNDA term in years"
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={values.mndaTermYears}
              onChange={(event) => set("mndaTermYears", event.target.value)}
              onFocus={() => set("mndaTerm", "fixed")}
              disabled={values.mndaTerm !== "fixed"}
            />
            <span>year(s) from the effective date</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mnda-term"
              checked={values.mndaTerm === "untilTerminated"}
              onChange={() => set("mndaTerm", "untilTerminated")}
            />
            <span>Continues until terminated</span>
          </label>
        </div>
      </Section>

      <Section title="Term of confidentiality">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="confidentiality"
              checked={values.confidentiality === "fixed"}
              onChange={() => set("confidentiality", "fixed")}
            />
            <input
              type="number"
              min={1}
              aria-label="Confidentiality term in years"
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={values.confidentialityYears}
              onChange={(event) => set("confidentialityYears", event.target.value)}
              onFocus={() => set("confidentiality", "fixed")}
              disabled={values.confidentiality !== "fixed"}
            />
            <span>year(s), trade secrets excepted</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="confidentiality"
              checked={values.confidentiality === "perpetual"}
              onChange={() => set("confidentiality", "perpetual")}
            />
            <span>In perpetuity</span>
          </label>
        </div>
      </Section>

      <Section title="Governing law & jurisdiction">
        <Field label="Governing law" hint="State" htmlFor="governing-law">
          <input
            id="governing-law"
            className={fieldClass}
            value={values.governingLaw}
            onChange={(event) => set("governingLaw", event.target.value)}
            placeholder="Delaware"
          />
        </Field>
        <Field
          label="Jurisdiction"
          hint="City or county and state"
          htmlFor="jurisdiction"
        >
          <input
            id="jurisdiction"
            className={fieldClass}
            value={values.jurisdiction}
            onChange={(event) => set("jurisdiction", event.target.value)}
            placeholder="courts located in New Castle, DE"
          />
        </Field>
      </Section>

      <Section title="Parties">
        <div className="grid gap-6 sm:grid-cols-2">
          <PartyFields
            legend="Party 1"
            idPrefix="party-one"
            party={values.partyOne}
            onChange={(party) => set("partyOne", party)}
          />
          <PartyFields
            legend="Party 2"
            idPrefix="party-two"
            party={values.partyTwo}
            onChange={(party) => set("partyTwo", party)}
          />
        </div>
      </Section>

      <Section title="Modifications">
        <Field
          label="MNDA modifications"
          hint="Optional. Changes here control over the standard terms."
          htmlFor="modifications"
        >
          <textarea
            id="modifications"
            className={`${fieldClass} min-h-20 resize-y`}
            value={values.modifications}
            onChange={(event) => set("modifications", event.target.value)}
            placeholder="Leave blank if none."
          />
        </Field>
      </Section>
    </form>
  );
}
