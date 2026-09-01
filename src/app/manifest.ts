import type { MetadataRoute } from "next";
import { PRODUCT_DESCRIPTION, PRODUCT_LOGO, PRODUCT_NAME, productTitle } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: productTitle(),
    short_name: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#eef3f1",
    theme_color: "#0b3d38",
    orientation: "any",
    categories: ["business", "finance"],
    prefer_related_applications: false,
    icons: [
      { src: PRODUCT_LOGO, sizes: "512x512", type: "image/jpeg" },
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
