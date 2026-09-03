import type { Metadata } from "next";
import { SavedDocuments } from "@/components/SavedDocuments";

export const metadata: Metadata = {
  title: "My documents",
  description: "Agreements you have drafted and kept.",
};

export default function SavedDocumentsPage() {
  return <SavedDocuments />;
}
