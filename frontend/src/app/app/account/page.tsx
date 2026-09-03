import type { Metadata } from "next";
import { AccountSettings } from "@/components/AccountSettings";

export const metadata: Metadata = {
  title: "Account",
  description: "Your account, and changing your password.",
};

export default function AccountPage() {
  return <AccountSettings />;
}
