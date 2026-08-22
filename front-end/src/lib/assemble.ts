/**
 * Assembles the complete Mutual NDA: a cover page built from the user's answers,
 * followed by the Common Paper Standard Terms reproduced verbatim.
 *
 * The cover page is constructed here rather than parsed from
 * templates/mutual-nda-coverpage.md, because that file is a blank form -- its
 * bracketed placeholders and empty signature table exist to be replaced. The
 * headings, wording, and ordering below deliberately mirror it.
 */
import type { Block, Inline, NdaDocument, SignatureRow } from "./document";
import { parseStandardTerms } from "./markdown";
import {
  type NdaFormValues,
  formatEffectiveDate,
  formatYears,
} from "./form";
import { coverPage as coverPageMarkdown, standardTerms } from "@/generated/mnda-template";

/** Renders a user-supplied value, marking blanks so gaps are visible. */
function value(text: string, placeholder: string): Inline {
  const trimmed = text.trim();
  return trimmed.length > 0
    ? { kind: "value", text: trimmed, filled: true }
    : { kind: "value", text: placeholder, filled: false };
}

/**
 * The MNDA's preamble, quoted from the cover page template so the app does not
 * silently paraphrase the agreement's own description of itself.
 */
function preamble(): Block {
  const standardsLink = /\[([^\]]+)\]\((https:\/\/commonpaper\.com[^)]+)\)/.exec(
    coverPageMarkdown,
  );
  return {
    kind: "paragraph",
    content: [
      {
        kind: "text",
        text:
          "This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: " +
          "(1) this Cover Page and (2) the Common Paper Mutual NDA Standard Terms " +
          "Version 1.0 (“Standard Terms”) identical to those posted at ",
      },
      standardsLink
        ? { kind: "link", text: standardsLink[1], href: standardsLink[2] }
        : { kind: "text", text: "commonpaper.com/standards/mutual-nda/1.0" },
      {
        kind: "text",
        text:
          ". Any modifications of the Standard Terms should be made on the Cover " +
          "Page, which will control over conflicts with the Standard Terms.",
      },
    ],
  };
}

function termBlocks(values: NdaFormValues): Block[] {
  const years = formatYears(values.mndaTermYears);
  return [
    { kind: "heading", text: "MNDA Term" },
    { kind: "label", text: "The length of this MNDA" },
    {
      kind: "option",
      checked: values.mndaTerm === "fixed",
      content: [
        { kind: "text", text: "Expires " },
        value(years, "___"),
        { kind: "text", text: " from the Effective Date." },
      ],
    },
    {
      kind: "option",
      checked: values.mndaTerm === "untilTerminated",
      content: [
        {
          kind: "text",
          text: "Continues until terminated in accordance with the terms of the MNDA.",
        },
      ],
    },
  ];
}

function confidentialityBlocks(values: NdaFormValues): Block[] {
  const years = formatYears(values.confidentialityYears);
  return [
    { kind: "heading", text: "Term of Confidentiality" },
    { kind: "label", text: "How long Confidential Information is protected" },
    {
      kind: "option",
      checked: values.confidentiality === "fixed",
      content: [
        value(years, "___"),
        {
          kind: "text",
          text:
            " from the Effective Date, but in the case of trade secrets until " +
            "Confidential Information is no longer considered a trade secret " +
            "under applicable laws.",
        },
      ],
    },
    {
      kind: "option",
      checked: values.confidentiality === "perpetual",
      content: [{ kind: "text", text: "In perpetuity." }],
    },
  ];
}

function signatureBlock(values: NdaFormValues): Block {
  const { partyOne, partyTwo } = values;
  const rows: SignatureRow[] = [
    { label: "Signature", values: ["", ""] },
    { label: "Print Name", values: [partyOne.printName, partyTwo.printName] },
    { label: "Title", values: [partyOne.title, partyTwo.title] },
    { label: "Company", values: [partyOne.company, partyTwo.company] },
    {
      label: "Notice Address",
      values: [partyOne.noticeAddress, partyTwo.noticeAddress],
    },
    { label: "Date", values: ["", ""] },
  ];

  const name = (company: string, fallback: string) =>
    company.trim().length > 0 ? company.trim() : fallback;

  return {
    kind: "signatures",
    rows,
    parties: [
      name(partyOne.company, "Party 1"),
      name(partyTwo.company, "Party 2"),
    ],
  };
}

/** Builds the filled cover page. */
export function buildCoverPage(values: NdaFormValues): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: "Mutual Non-Disclosure Agreement" },
    preamble(),

    { kind: "heading", text: "Purpose" },
    { kind: "label", text: "How Confidential Information may be used" },
    {
      kind: "paragraph",
      content: [value(values.purpose, "[Describe the purpose]")],
    },

    { kind: "heading", text: "Effective Date" },
    {
      kind: "paragraph",
      content: [
        value(formatEffectiveDate(values.effectiveDate), "[Effective date]"),
      ],
    },

    ...termBlocks(values),
    ...confidentialityBlocks(values),

    { kind: "heading", text: "Governing Law & Jurisdiction" },
    {
      kind: "paragraph",
      content: [
        { kind: "strong", text: "Governing Law: " },
        value(values.governingLaw, "[State]"),
      ],
    },
    {
      kind: "paragraph",
      content: [
        { kind: "strong", text: "Jurisdiction: " },
        value(values.jurisdiction, "[City or county and state]"),
      ],
    },
  ];

  // Only shown when the user actually entered modifications; an empty
  // "Modifications" heading on a signed agreement invites confusion.
  const modifications = values.modifications.trim();
  if (modifications.length > 0) {
    blocks.push(
      { kind: "heading", text: "MNDA Modifications" },
      { kind: "paragraph", content: [{ kind: "text", text: modifications }] },
    );
  }

  blocks.push({
    kind: "paragraph",
    content: [
      {
        kind: "text",
        text:
          "By signing this Cover Page, each party agrees to enter into this MNDA " +
          "as of the Effective Date.",
      },
    ],
  });

  blocks.push(signatureBlock(values));

  return blocks;
}

/** Cover page + verbatim standard terms. */
export function assembleDocument(values: NdaFormValues): NdaDocument {
  return {
    blocks: [...buildCoverPage(values), ...parseStandardTerms(standardTerms)],
  };
}
