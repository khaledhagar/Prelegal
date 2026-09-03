// @vitest-environment node
/**
 * Guards the generated document registry against the repository it is derived
 * from.
 *
 * The generator runs before every dev, build and test, so these tests are
 * really about the *rules* it applies: that every catalogued agreement arrives,
 * that the text is reproduced byte for byte, and that the field extraction has
 * not quietly started dropping or inventing variables. A field name that drifts
 * here breaks the assistant silently -- it fills in something nothing renders.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { documents, groupLabels } from "./documents";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function template(filename: string): string {
  return readFileSync(resolve(repoRoot, "templates", filename), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const catalog = JSON.parse(
  readFileSync(resolve(repoRoot, "catalog.json"), "utf8"),
) as { templates: Array<{ name: string; filename: string }> };

describe("the generated registry", () => {
  it("covers every agreement in the catalog", () => {
    // Twelve template files, but the Mutual NDA's two rows are one agreement.
    const expected = new Set(
      catalog.templates.map((entry) =>
        entry.filename.replace(/-coverpage\.md$/, "").replace(/\.md$/, ""),
      ),
    );

    expect(new Set(documents.map((document) => document.slug))).toEqual(expected);
  });

  it("reproduces each template's standard terms byte for byte", () => {
    for (const document of documents) {
      expect(document.standardTerms).toBe(template(document.standardTermsFile));
    }
  });

  it("gives the Mutual NDA its cover page and the others none", () => {
    const mnda = documents.find((document) => document.slug === "mutual-nda");
    expect(mnda?.coverPage).toBe(template("mutual-nda-coverpage.md"));

    const others = documents.filter((document) => document.slug !== "mutual-nda");
    expect(others.map((document) => document.coverPage)).toEqual(
      others.map(() => null),
    );
  });
});

describe("every document", () => {
  it.each(documents.map((document) => [document.slug, document] as const))(
    "%s declares usable fields",
    (_slug, document) => {
      expect(document.fields.length).toBeGreaterThan(0);
      expect(document.parties).toHaveLength(2);
      expect(document.groups.length).toBeGreaterThan(0);

      for (const field of document.fields) {
        expect(field.key).toMatch(/^[a-z][A-Za-z0-9]*$/);
        expect(field.label.length).toBeGreaterThan(0);
        // Every field needs a question; without one the assistant has nothing
        // to say and falls back to reading the legal variable name aloud.
        expect(field.ask.length).toBeGreaterThan(0);
        expect(Object.keys(groupLabels)).toContain(field.group);
      }
    },
  );

  it.each(documents.map((document) => [document.slug, document] as const))(
    "%s has no duplicate field keys",
    (_slug, document) => {
      const keys = document.fields.map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    },
  );

  it.each(documents.map((document) => [document.slug, document] as const))(
    "%s only groups fields it declares a group for",
    (_slug, document) => {
      const used = new Set(document.fields.map((field) => field.group));
      expect(new Set(document.groups)).toEqual(used);
    },
  );
});

describe("field extraction", () => {
  it("keeps the Mutual NDA on the names it has always used", () => {
    // These names travel from the LLM schema through the API to the renderer.
    // Renaming one without the others breaks the assistant silently.
    const mnda = documents.find((document) => document.slug === "mutual-nda");

    expect(mnda?.fields.map((field) => field.key).sort()).toEqual([
      "effectiveDate",
      "governingLaw",
      "jurisdiction",
      "mndaModifications",
      "mndaTerm",
      "purpose",
      "termOfConfidentiality",
    ]);
  });

  it("names the Mutual NDA's parties from its cover page", () => {
    // The MNDA is the one template whose parties are not variables in the
    // standard terms, so the generator falls back to the cover page's wording.
    const mnda = documents.find((document) => document.slug === "mutual-nda");
    expect(mnda?.parties).toEqual(["Party 1", "Party 2"]);
  });

  it("recognises the party roles the other agreements use", () => {
    const sla = documents.find(
      (document) => document.slug === "service-level-agreement",
    );
    expect(sla?.parties).toEqual(["Provider", "Customer"]);

    const partnership = documents.find(
      (document) => document.slug === "partnership-agreement",
    );
    expect(partnership?.parties).toEqual(["Company", "Partner"]);
  });

  it("does not turn a party role into a fill-in field", () => {
    for (const document of documents) {
      const labels = document.fields.map((field) => field.label);
      expect(labels).not.toContain("Customer");
      expect(labels).not.toContain("Provider");
    }
  });

  it("folds possessives and plurals into one field", () => {
    // The templates write Customer's, Subscription Periods and Deliverables
    // alongside their singular forms; each pair is one value to collect.
    const csa = documents.find(
      (document) => document.slug === "cloud-service-agreement",
    );
    const keys = csa?.fields.map((field) => field.key) ?? [];
    expect(keys).toContain("subscriptionPeriod");
    expect(keys).not.toContain("subscriptionPeriods");

    const psa = documents.find(
      (document) => document.slug === "professional-services-agreement",
    );
    const psaKeys = psa?.fields.map((field) => field.key) ?? [];
    expect(psaKeys).toContain("deliverable");
    expect(psaKeys).not.toContain("deliverables");
  });

  it("keeps a plural that has no singular in the text", () => {
    // "Chosen Courts" is simply a plural noun -- there is no "Chosen Court".
    const pilot = documents.find((document) => document.slug === "pilot-agreement");
    expect(pilot?.fields.map((field) => field.key)).toContain("chosenCourts");
  });

  it("splits multi-namespace agreements across their groups", () => {
    // A PSA's terms live on Key Terms and a Statement of Work; the split is
    // what gives the generated cover page its section headings.
    const psa = documents.find(
      (document) => document.slug === "professional-services-agreement",
    );
    expect(psa?.groups).toEqual(["sow", "keyterms"]);
  });
});

describe("curated hints", () => {
  it("reach the fields they were written for", () => {
    const sla = documents.find(
      (document) => document.slug === "service-level-agreement",
    );
    const uptime = sla?.fields.find((field) => field.key === "targetUptime");

    expect(uptime?.ask).toBe("What uptime are you committing to?");
    expect(uptime?.type).toBe("percent");
    expect(uptime?.required).toBe(true);
  });

  it("let a document override a shared hint", () => {
    // `governingLaw` is shared, but the MNDA asks about jurisdiction in the
    // template's own words.
    const mnda = documents.find((document) => document.slug === "mutual-nda");
    const jurisdiction = mnda?.fields.find((field) => field.key === "jurisdiction");

    expect(jurisdiction?.caption).toContain("New Castle");
  });

  it("give either/or terms their exact phrasings", () => {
    const mnda = documents.find((document) => document.slug === "mutual-nda");
    const term = mnda?.fields.find((field) => field.key === "mndaTerm");

    expect(term?.options).toHaveLength(2);
    expect(term?.options?.[0]).toContain("{n}");
  });

  it("fall back to a readable question when none is written", () => {
    // A field with no hint must still be askable, so a template added tomorrow
    // works today rather than showing a camelCase key to the user.
    for (const document of documents) {
      for (const field of document.fields) {
        expect(field.ask).not.toMatch(/[a-z][A-Z]/);
      }
    }
  });

  it("attaches the stated limits to the documents that have them", () => {
    const psa = documents.find(
      (document) => document.slug === "professional-services-agreement",
    );
    expect(psa?.limitation).toContain("One statement of work");
  });
});
