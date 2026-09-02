import type { Metadata } from "next";
import { NdaCreator } from "@/components/NdaCreator";

export const metadata: Metadata = {
  title: "Mutual NDA creator",
  description:
    "Fill in a cover page and download a complete Common Paper Mutual Non-Disclosure Agreement.",
};

/**
 * The platform's landing page. The Mutual NDA creator is the only tool so far,
 * so it is what you get; a document picker belongs with the ticket that adds a
 * second document type.
 */
export default function AppHome() {
  return <NdaCreator />;
}
