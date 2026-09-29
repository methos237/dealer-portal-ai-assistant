import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dealer Portal",
    short_name: "Dealer Portal",
    description: "Units, warranty claims and parts orders for THOR dealers.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f4f3",
    theme_color: "#1b1918",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
