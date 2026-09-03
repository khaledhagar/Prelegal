import type { Metadata } from "next";
import { DocumentCreator } from "@/components/DocumentCreator";

export const metadata: Metadata = {
  title: "Agreement drafter",
  description:
    "Talk through a Common Paper legal agreement and download it as a PDF.",
};

/**
 * The platform's landing page. Choosing between the agreements happens inside
 * the workspace rather than on a route of its own, because working out which
 * document someone needs is part of the conversation.
 */
export default function AppHome() {
  return <DocumentCreator />;
}
