import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/auth", "/ingresar", "/marketplace/buscar"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
