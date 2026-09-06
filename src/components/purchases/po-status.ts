export const poStatusVariant = (s: string) =>
  (({ DRAFT: "muted", ORDERED: "secondary", PARTIALLY_RECEIVED: "warning", RECEIVED: "success", CANCELLED: "destructive" }) as Record<string, "muted" | "secondary" | "warning" | "success" | "destructive">)[s] ?? "muted"
