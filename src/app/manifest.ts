import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RetailOS Morocco",
    short_name: "RetailOS",
    description: "Gestion complète de commerce : caisse, stock, achats, dépenses, analytique.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#1f8a5b",
    lang: "fr",
    dir: "auto",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Caisse (POS)", short_name: "POS", url: "/pos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Tableau de bord", short_name: "Dashboard", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  }
}
