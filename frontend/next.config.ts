import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app builds to plain static files. Nothing here needs a Node server:
  // the agreement is assembled and rendered to PDF in the browser, and the
  // backend's job is to hand these files out (and, later, to answer /api).
  output: "export",

  // Emits `/app` as `out/app/index.html` rather than `out/app.html`, which is
  // what FastAPI's StaticFiles(html=True) knows how to resolve. Without it the
  // backend would need custom routing to find the page for a directory URL.
  trailingSlash: true,
};

export default nextConfig;
