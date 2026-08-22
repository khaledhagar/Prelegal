import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is entirely client-side: the agreement is assembled and rendered to
  // PDF in the browser, and no form data ever leaves the machine. That lets it
  // ship as plain static files.
  output: "export",
};

export default nextConfig;
