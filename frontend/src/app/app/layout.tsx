import { AppShell } from "@/components/AppShell";

/**
 * Everything under `/app` is the signed-in product. This layout stays a server
 * component so the segment can carry metadata; the chrome and the session guard
 * live in `AppShell`, which needs the browser.
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <AppShell>{children}</AppShell>;
}
