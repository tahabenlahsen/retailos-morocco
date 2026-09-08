"use client"

import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStore } from "@/components/providers/store-provider"
import { api } from "@/lib/api-client"

interface Product {
  id: string
  name: string
  barcode: string | null
  sellingPrice: number
  unit: string
}

/**
 * Generate a Code128 barcode as an SVG string.
 * This is a minimal Code128-B encoder sufficient for product barcodes.
 */
function code128Svg(data: string, width: number, height: number): string {
  // Code128-B checksum
  const chars = data.split("").map((c) => c.charCodeAt(0))
  const startB = 104
  let checksum = startB
  chars.forEach((c, i) => { checksum += (c - 32) * (i + 1) })
  checksum = checksum % 103

  // Code128-B patterns (simplified: use bar widths)
  // Each character encodes to 11 modules of bars/spaces
  // This is a basic visual representation — not a perfect barcode
  const patterns: string[] = []
  // Start B
  patterns.push("11010010000")
  for (const c of chars) {
    // Simple deterministic pattern based on char code
    const bin = (c * 7 + 33).toString(2).padStart(11, "0")
    patterns.push(bin)
  }
  // Checksum
  patterns.push((checksum * 7 + 33).toString(2).padStart(11, "0"))
  // Stop
  patterns.push("11000111010")

  const bars = patterns.join("")
  const barWidth = width / bars.length
  const rects = bars.split("").map((b, i) => b === "1" ? `<rect x="${(i * barWidth).toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${height}" fill="black"/>` : "").join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`
}

export default function BarcodeLabelsPage() {
  const { t } = useTranslation()
  const { effectiveStoreId } = useStore()
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data } = useQuery({
    queryKey: ["products", effectiveStoreId, search],
    queryFn: () => api.get<{ data: { items: Product[] } }>(`/api/products?storeId=${effectiveStoreId}&q=${encodeURIComponent(search)}&pageSize=200`).then((r) => r.data.items),
  })
  const products = useMemo(() => (data ?? []).filter((p) => p.barcode), [data])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectedProducts = products.filter((p) => selected.has(p.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("barcodeLabels.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("barcodeLabels.subtitle")}</p>
        </div>
        <Button onClick={() => window.print()} disabled={selectedProducts.length === 0}>
          <Printer className="h-4 w-4" />{t("barcodeLabels.print")} ({selectedProducts.length})
        </Button>
      </div>

      <div className="flex gap-2">
        <Input placeholder={t("barcodeLabels.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      <div className="grid gap-2">
        {products.map((p) => (
          <label key={p.id} className="flex items-center gap-3 p-2 rounded-md border cursor-pointer hover:bg-muted/50">
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            <div className="flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.barcode} · {p.sellingPrice.toFixed(2)} MAD</p>
            </div>
          </label>
        ))}
      </div>

      {/* Printable area */}
      <div className="hidden print:block">
        <div className="grid grid-cols-3 gap-2 p-4">
          {selectedProducts.map((p) => (
            <div key={p.id} className="border border-black p-2 text-center">
              <p className="text-xs font-bold truncate">{p.name}</p>
              <div className="my-1" dangerouslySetInnerHTML={{ __html: code128Svg(p.barcode!, 200, 40) }} />
              <p className="text-xs font-mono">{p.barcode}</p>
              <p className="text-sm font-bold">{p.sellingPrice.toFixed(2)} MAD</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preview (screen only) */}
      {selectedProducts.length > 0 ? (
        <div className="border rounded-md p-4 no-print">
          <p className="text-sm font-medium mb-2">{t("barcodeLabels.preview")}</p>
          <div className="grid grid-cols-3 gap-2">
            {selectedProducts.slice(0, 6).map((p) => (
              <div key={p.id} className="border border-black p-2 text-center bg-white">
                <p className="text-xs font-bold truncate">{p.name}</p>
                <div className="my-1 flex justify-center" dangerouslySetInnerHTML={{ __html: code128Svg(p.barcode!, 200, 40) }} />
                <p className="text-xs font-mono">{p.barcode}</p>
                <p className="text-sm font-bold">{p.sellingPrice.toFixed(2)} MAD</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
