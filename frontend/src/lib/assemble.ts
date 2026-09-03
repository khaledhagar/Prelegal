/**
 * Assembles a complete agreement: a cover page built from the user's answers,
 * followed by the Common Paper standard terms reproduced verbatim.
 *
 * The cover page is constructed here rather than parsed from a template.
 * Only the Mutual NDA ships one (templates/mutual-nda-coverpage.md) and even
 * that is a blank form -- its bracketed placeholders exist to be replaced. The
 * other ten agreements have no cover page file at all: Common Paper leaves the
 * Order Form, Key Terms, Business Terms or SOW for each party to draft. So we
 * build one, grouping the fields the way the agreement's own variables are
 * grouped.
 */
import {
  splitParagraphs,
  type Agreement,
  type Block,
  type Inline,
  type SignatureRow,
} from "./document";
import { parseStandardTerms } from "./markdown";
import { groupLabel } from "./documents/registry";
import type {
  DocumentDefinition,
  DocumentField,
  DocumentValues,
} from "./documents/types";
import { displayValue, fieldValue } from "./values";

/** Renders a user-supplied value, marking blanks so gaps are visible. */
function value(text: string, placeholder: string): Inline {
  const trimmed = text.trim();
  return trimmed.length > 0
    ? { kind: "value", text: trimmed, filled: true }
    : { kind: "value", text: placeholder, filled: false };
}

/**
 * Turns multi-line input into one paragraph per line.
 *
 * A single block would lose the line breaks entirely: HTML collapses whitespace
 * and @react-pdf/renderer ignores newlines inside a Text node, so a numbered
 * list of obligations would render as one run-on sentence in both outputs.
 */
function freeTextBlocks(text: string, placeholder: string): Block[] {
  const lines = splitParagraphs(text);
  if (lines.length === 0) {
    return [{ kind: "paragraph", content: [value("", placeholder)] }];
  }
  return lines.map((line) => ({
    kind: "paragraph",
    content: [value(line, placeholder)],
  }));
}

/** The standards URL the agreement points at, if it names one. */
function standardsLink(document: DocumentDefinition): Inline | null {
  const source = `${document.coverPage ?? ""}\n${document.standardTerms}`;
  const markdown = /\[([^\]]+)\]\((https:\/\/commonpaper\.com\/standards[^)]+)\)/.exec(
    source,
  );
  if (markdown) return { kind: "link", text: markdown[1], href: markdown[2] };

  const bare = /<(https:\/\/commonpaper\.com\/standards[^>]+)>/.exec(source);
  if (bare) {
    return { kind: "link", text: bare[1].replace(/^https:\/\//, ""), href: bare[1] };
  }
  return null;
}

/**
 * The paragraph explaining what the document is made of.
 *
 * Every Common Paper agreement says this about itself in more or less the same
 * words; saying it here keeps a generated cover page honest about the fact that
 * the standard terms below are incorporated unmodified.
 */
function preamble(document: DocumentDefinition): Block {
  const link = standardsLink(document);
  const content: Inline[] = [
    {
      kind: "text",
      text:
        `This ${document.name} consists of: (1) this Cover Page and ` +
        `(2) the Common Paper ${document.name} Standard Terms`,
    },
  ];

  if (link) {
    content.push({ kind: "text", text: " identical to those posted at " }, link);
  }

  content.push({
    kind: "text",
    text:
      ". Any modifications of the Standard Terms should be made on the Cover " +
      "Page, which will control over conflicts with the Standard Terms.",
  });

  return { kind: "paragraph", content };
}

/** An option with `{n}` filled in, or with a blank where the number goes. */
function renderOption(option: string, count: string | null): string {
  return option.replace(/\{n\}/g, count ?? "___");
}

/**
 * Works out which of an either/or term's options an answer selects.
 *
 * `{n}` marks a number the user supplies, so "Expires {n} year(s) from
 * Effective Date." is selected by that exact phrase. The assistant is told to
 * copy one of the phrases verbatim, but it is a language model and will
 * sometimes answer "2 years" to "how long should the NDA run?" -- so a bare
 * number is also accepted, since it can only mean the option that takes one.
 *
 * Anything else returns null and the answer is rendered as the user gave it:
 * losing what someone actually said would be worse than an unticked box.
 */
function selectedOption(
  options: string[],
  answer: string,
): { index: number; text: string } | null {
  if (answer.length === 0) return null;

  const asPattern = (option: string) =>
    new RegExp(
      `^${option
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\{n\\\}/g, "(.+?)")}$`,
      "i",
    );

  const exact = options.findIndex((option) => asPattern(option).test(answer));
  if (exact !== -1) return { index: exact, text: answer };

  const number = /^(\d+)\b/.exec(answer);
  const parametrized = options.findIndex((option) => option.includes("{n}"));
  if (number && parametrized !== -1) {
    return {
      index: parametrized,
      text: renderOption(options[parametrized], number[1]),
    };
  }

  return null;
}

/**
 * Builds the checkbox list for an either/or term, ticking the chosen one.
 */
function optionBlocks(field: DocumentField, raw: string): Block[] {
  const options = field.options ?? [];
  const answer = raw.trim();
  const selected = selectedOption(options, answer);

  if (answer.length > 0 && selected === null) {
    return [{ kind: "paragraph", content: [value(answer, "")] }];
  }

  return options.map((option, index) => ({
    kind: "option",
    checked: index === selected?.index,
    content:
      index === selected?.index
        ? [{ kind: "value", text: selected.text, filled: true }]
        : [{ kind: "text", text: renderOption(option, null) }],
  }));
}

/** One field's heading, caption and answer. */
function fieldBlocks(field: DocumentField, values: DocumentValues): Block[] {
  const blocks: Block[] = [{ kind: "heading", text: field.label }];
  if (field.caption) blocks.push({ kind: "label", text: field.caption });

  const raw = values.fields[field.key] ?? "";

  if (field.options) {
    blocks.push(...optionBlocks(field, raw));
    return blocks;
  }

  if (field.type === "multiline") {
    blocks.push(...freeTextBlocks(raw, `[${field.label}]`));
    return blocks;
  }

  blocks.push({
    kind: "paragraph",
    content: [value(displayValue(field, raw), `[${field.label}]`)],
  });
  return blocks;
}

function signatureBlock(
  document: DocumentDefinition,
  values: DocumentValues,
): Block {
  const [one, two] = values.parties;
  const rows: SignatureRow[] = [
    { label: "Signature", values: ["", ""] },
    { label: "Print Name", values: [one.printName, two.printName] },
    { label: "Title", values: [one.title, two.title] },
    { label: "Company", values: [one.company, two.company] },
    { label: "Notice Address", values: [one.noticeAddress, two.noticeAddress] },
    { label: "Date", values: ["", ""] },
  ];

  const name = (company: string, fallback: string) =>
    company.trim().length > 0 ? company.trim() : fallback;

  return {
    kind: "signatures",
    rows,
    parties: [
      name(one.company, document.parties[0]),
      name(two.company, document.parties[1]),
    ],
  };
}

/**
 * Whether a field is worth putting on the cover page.
 *
 * Required fields always appear, blank or not, because their gap is the point.
 * Optional ones appear only once answered -- an empty "Increased Cap Amount"
 * heading on a signed agreement invites confusion about whether it was
 * negotiated and left out, or never discussed.
 */
function shouldRender(field: DocumentField, values: DocumentValues): boolean {
  return field.required || fieldValue(values, field.key).length > 0;
}

/** Builds the filled cover page. */
export function buildCoverPage(
  document: DocumentDefinition,
  values: DocumentValues,
): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: document.name },
    preamble(document),
  ];

  for (const group of document.groups) {
    const fields = document.fields.filter(
      (field) => field.group === group && shouldRender(field, values),
    );
    if (fields.length === 0) continue;

    // The heading is only worth showing when an agreement genuinely splits its
    // terms across more than one fill-in document, which most do not.
    if (document.groups.length > 1) {
      blocks.push({ kind: "heading", text: groupLabel(group) });
    }

    for (const field of fields) {
      blocks.push(...fieldBlocks(field, values));
    }
  }

  blocks.push({
    kind: "paragraph",
    content: [
      {
        kind: "text",
        text:
          `By signing this Cover Page, each party agrees to enter into this ` +
          `${document.name} as of the Effective Date.`,
      },
    ],
  });

  blocks.push(signatureBlock(document, values));

  return blocks;
}

/** Cover page + verbatim standard terms. */
export function assembleAgreement(
  document: DocumentDefinition,
  values: DocumentValues,
): Agreement {
  return {
    blocks: [
      ...buildCoverPage(document, values),
      ...parseStandardTerms(document.standardTerms),
    ],
  };
}
