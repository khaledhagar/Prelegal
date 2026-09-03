/**
 * The shape of a supported agreement.
 *
 * A document is two halves, joined at build time by
 * scripts/build-documents.mjs: the field names it read out of the template in
 * templates/, and what a person wrote in hints.json about how to ask for each
 * value. What reaches the app is the joined result, `DocumentDefinition`.
 */

/** Which fill-in document a value belongs to, per Common Paper's structure. */
export type FieldGroup =
  | "coverpage"
  | "keyterms"
  | "orderform"
  | "businessterms"
  | "sow";

/** A value the user has to supply, as read out of the template's markdown. */
export type GeneratedField = {
  /** camelCase; the name shared by the LLM schema, the API and the renderer. */
  key: string;
  /** The variable's name as the agreement writes it, e.g. "Target Uptime". */
  label: string;
  group: FieldGroup;
};

/**
 * How a field is written about and asked for.
 *
 * Without this the assistant would read the legal variable name aloud -- "What
 * is the Increased Cap Amount?" -- which is exactly the experience PL-5 was
 * built to avoid. Hints are optional: a field with none falls back to its
 * label, so a newly added template works immediately and reads better once
 * someone writes a line for it.
 */
export type FieldHint = {
  /** The question the assistant asks, in plain language. */
  ask?: string;
  /** A short caption rendered under the heading on the cover page. */
  caption?: string;
  type?: FieldType;
  /**
   * The shapes a valid answer can take, for either/or terms.
   * `{n}` marks a number the user supplies, e.g. "Expires {n} year(s)".
   */
  options?: string[];
  /** Whether the agreement is incomplete without it. */
  required?: boolean;
};

export type FieldType =
  | "text"
  /** Free text that may run to several lines, e.g. a list of obligations. */
  | "multiline"
  | "date"
  /** A span of time, e.g. "12 months". */
  | "duration"
  | "money"
  | "percent";

/** A field with its hint resolved; what the UI and the prompt are built from. */
export type DocumentField = GeneratedField & {
  ask: string;
  caption?: string;
  type: FieldType;
  options?: string[];
  required: boolean;
};

export type DocumentDefinition = {
  slug: string;
  name: string;
  description: string;
  standardTermsFile: string;
  coverPageFile: string | null;
  /** The agreement's standard terms, inlined at build time. */
  standardTerms: string;
  /** Only the Mutual NDA ships one; the rest have their cover page generated. */
  coverPage: string | null;
  /** The two role names the agreement calls its parties, e.g. Customer/Provider. */
  parties: string[];
  fields: DocumentField[];
  /** Group names present on this document, in rendering order. */
  groups: FieldGroup[];
  /**
   * A caveat shown in the UI and told to the assistant, where the product
   * genuinely cannot do everything the agreement allows. Stating the limit
   * beats letting someone discover it in a signed contract.
   */
  limitation?: string;
};

/** One party's details. Every agreement has exactly two. */
export type PartyValues = {
  company: string;
  printName: string;
  title: string;
  noticeAddress: string;
};

/**
 * Everything captured for one agreement.
 *
 * `fields` is flat and keyed by `DocumentField["key"]` so it can carry any
 * document's values without a per-document type. The backend validates the
 * keys against the selected document before merging, so an unknown key from
 * the model is dropped rather than stored.
 */
export type DocumentValues = {
  /** The chosen agreement's slug; empty until the assistant settles on one. */
  documentType: string;
  fields: Record<string, string>;
  parties: [PartyValues, PartyValues];
};
