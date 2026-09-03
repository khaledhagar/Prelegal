/**
 * Renders the shared document model to a PDF.
 *
 * Mirrors src/components/AgreementPreview.tsx block for block. @react-pdf/renderer
 * paginates automatically and emits real text, so the result stays selectable,
 * searchable, and accessible -- which a rasterized screenshot would not.
 */
import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  assertNever,
  type Block,
  type Inline,
  type Agreement as Model,
} from "@/lib/document";

// Paper and ink, matching the on-screen preview. A printed contract in brand
// colours reads as marketing, so the palette stays out of the document itself.
const COLORS = {
  ink: "#1a1a17",
  muted: "#5d5f5a",
  faint: "#8b8d86",
  rule: "#ddd9cd",
  link: "#3b3a34",
  highlight: "#fdf1cf",
  noticeInk: "#5c4708",
  noticeRule: "#e3c15f",
  noticeFill: "#fdf6e3",
};

/**
 * LETTER is 792pt tall. The page-number footer is positioned from the top
 * rather than with `bottom`, which is what you would reach for first.
 *
 * A `fixed` element positioned with `bottom` makes @react-pdf 4.6.1 compute a
 * nonsense translation once a document runs past a certain length -- rendering
 * dies with "unsupported number: -8.85e+21" somewhere in the middle of the
 * Cloud Service, Professional Services and Software License agreements, which
 * are the three longest. Anchoring from the top puts the footer in the same
 * place and renders all eleven. Do not "tidy" this back to `bottom` without
 * rendering every agreement first -- src/pdf/AgreementDocument.test.tsx does
 * exactly that.
 */
const PAGE_HEIGHT = 792;
const FOOTER_FROM_TOP = PAGE_HEIGHT - 40;

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontSize: 10,
    lineHeight: 1.5,
    fontFamily: "Times-Roman",
    color: COLORS.ink,
  },
  title: {
    fontSize: 16,
    fontFamily: "Times-Bold",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
  },
  heading: {
    fontSize: 10,
    fontFamily: "Times-Bold",
    marginTop: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: COLORS.muted,
  },
  label: { fontSize: 8, fontStyle: "italic", color: COLORS.faint, marginTop: 1 },
  paragraph: { marginTop: 5, textAlign: "justify" },
  clause: { marginTop: 9, textAlign: "justify" },
  section: { marginTop: 14, fontSize: 11, fontFamily: "Helvetica-Bold" },
  notice: {
    marginBottom: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.noticeRule,
    backgroundColor: COLORS.noticeFill,
    color: COLORS.noticeInk,
    fontSize: 8.5,
    lineHeight: 1.45,
  },
  noticeHeading: { fontFamily: "Helvetica-Bold" },
  option: { marginTop: 3, flexDirection: "row" },
  optionMarker: { width: 18, fontFamily: "Courier" },
  optionBody: { flex: 1 },
  strong: { fontFamily: "Times-Bold" },
  reference: { fontFamily: "Times-Bold", color: COLORS.muted },
  link: { color: COLORS.link, textDecoration: "underline" },
  filledValue: { backgroundColor: COLORS.highlight },
  emptyValue: { color: COLORS.faint },
  table: { marginTop: 12, borderTopWidth: 1, borderLeftWidth: 1, borderColor: COLORS.rule },
  row: { flexDirection: "row" },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.rule,
    padding: 5,
    fontSize: 9,
  },
  labelCell: { width: "24%", fontFamily: "Times-Bold" },
  partyCell: { width: "38%" },
  headerCell: { backgroundColor: "#f1f5f9", fontFamily: "Times-Bold" },
  // Signature and date cells need writing room on the printed page.
  signingCell: { minHeight: 34 },
  footnote: {
    marginTop: 18,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.rule,
    fontSize: 8,
    color: COLORS.muted,
  },
  pageNumber: {
    position: "absolute",
    top: FOOTER_FROM_TOP,
    left: 56,
    right: 56,
    textAlign: "center",
    fontSize: 8,
    color: COLORS.faint,
  },
});

/** Rows whose cells are left blank for wet-ink completion. */
const SIGNING_ROWS = new Set(["Signature", "Date"]);

function runs(content: Inline[]) {
  return content.map((run, index) => {
    switch (run.kind) {
      case "strong":
        return (
          <Text key={index} style={styles.strong}>
            {run.text}
          </Text>
        );
      case "reference":
        return (
          <Text key={index} style={styles.reference}>
            {run.text}
          </Text>
        );
      case "link":
        return (
          <Link key={index} src={run.href} style={styles.link}>
            {run.text}
          </Link>
        );
      case "value":
        return (
          <Text
            key={index}
            style={run.filled ? styles.filledValue : styles.emptyValue}
          >
            {run.text}
          </Text>
        );
      default:
        return <Text key={index}>{run.text}</Text>;
    }
  });
}

function SignatureTable({
  block,
}: {
  block: Extract<Block, { kind: "signatures" }>;
}) {
  return (
    // `wrap={false}` keeps the signature block from splitting across pages,
    // which would leave someone signing a fragment.
    <View style={styles.table} wrap={false}>
      <View style={styles.row}>
        <View style={[styles.cell, styles.labelCell, styles.headerCell]}>
          <Text> </Text>
        </View>
        {block.parties.map((party, index) => (
          <View
            key={index}
            style={[styles.cell, styles.partyCell, styles.headerCell]}
          >
            <Text>{party}</Text>
          </View>
        ))}
      </View>

      {block.rows.map((row) => {
        const signing = SIGNING_ROWS.has(row.label);
        return (
          <View key={row.label} style={styles.row}>
            <View style={[styles.cell, styles.labelCell]}>
              <Text>{row.label}</Text>
            </View>
            {row.values.map((cell, index) => (
              <View
                key={index}
                style={[
                  styles.cell,
                  styles.partyCell,
                  ...(signing ? [styles.signingCell] : []),
                ]}
              >
                <Text>{cell.trim().length > 0 ? cell : " "}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "title":
      return <Text style={styles.title}>{block.text}</Text>;
    case "heading":
      return <Text style={styles.heading}>{block.text}</Text>;
    case "label":
      return <Text style={styles.label}>{block.text}</Text>;
    case "paragraph":
      return <Text style={styles.paragraph}>{runs(block.content)}</Text>;
    case "section":
      return (
        <Text style={styles.section}>
          {block.marker} {block.text}
        </Text>
      );
    case "clause":
      return (
        <Text style={[styles.clause, { marginLeft: block.depth * 14 }]}>
          <Text style={styles.strong}>{block.marker} </Text>
          {runs(block.content)}
        </Text>
      );
    case "option":
      return (
        <View style={styles.option}>
          <Text style={styles.optionMarker}>{block.checked ? "[x]" : "[ ]"}</Text>
          <Text style={[styles.optionBody, ...(block.checked ? [] : [styles.emptyValue])]}>
            {runs(block.content)}
          </Text>
        </View>
      );
    case "signatures":
      return <SignatureTable block={block} />;
    case "footnote":
      return <Text style={styles.footnote}>{runs(block.content)}</Text>;
    default:
      // Keeps this switch exhaustive; see assertNever in src/lib/document.ts.
      return assertNever(block);
  }
}

export function AgreementPdfDocument({
  document,
  name,
}: {
  document: Model;
  /** The agreement's name, for the PDF's own title metadata. */
  name: string;
}) {
  return (
    <Document title={name} author="Prelegal" subject={`Common Paper ${name}`}>
      <Page size="LETTER" style={styles.page}>
        {/* The PDF is the artifact that leaves the app: it gets emailed on and
            read by people who never saw the screen it came from, so the notice
            has to travel with it rather than live in the interface. */}
        <View style={styles.notice}>
          <Text>
            <Text style={styles.noticeHeading}>DRAFT — FOR REVIEW. </Text>
            This document was generated from a template and the answers given to
            an automated assistant. It is not legal advice, and it should be
            reviewed by a qualified lawyer before it is signed or relied upon.
          </Text>
        </View>

        {document.blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Draft — subject to legal review    ·    ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
