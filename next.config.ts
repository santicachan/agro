import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font metrics (.afm) from node_modules at runtime; keep it unbundled.
  serverExternalPackages: ["pdfkit", "exceljs"],
  outputFileTracingIncludes: {
    "/app/libros/descargar": ["./node_modules/pdfkit/js/data/**/*"],
  },
  experimental: {
    // Marketplace photos go through a server action. Vercel caps request bodies
    // at ~4.5 MB, so keep the limit below that (see README: signed uploads TODO).
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
