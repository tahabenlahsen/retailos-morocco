/**
 * Server-side PDF generation (pdfkit) for receipts and accounting reports.
 *
 * Fonts: Helvetica (built-in) for Latin text; Amiri (SIL OFL, bundled) for any string that
 * contains Arabic characters, so Arabic product/customer names render correctly instead of boxes.
 * fontkit performs Arabic shaping and reverses RTL glyph runs, so pure-Arabic strings display
 * in the correct visual order. Mixed-direction paragraphs are not bidi-reordered (known limit).
 */
import PDFDocument from "pdfkit"
import path from "node:path"
import { readFileSync, existsSync } from "node:fs"
import type { Locale } from "@/lib/i18n/config"

const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts")
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F]/
let amiri: { regular: Buffer; bold: Buffer } | null | undefined

function arabicFonts() {
  if (amiri !== undefined) return amiri
  const r = path.join(FONT_DIR, "Amiri-Regular.ttf")
  const b = path.join(FONT_DIR, "Amiri-Bold.ttf")
  amiri = existsSync(r) && existsSync(b) ? { regular: readFileSync(r), bold: readFileSync(b) } : null
  return amiri
}

const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "«": "»", "»": "«", "<": ">", ">": "<" }

/**
 * Converts a logical-order string containing Arabic into the visual order pdfkit needs.
 * pdfkit lays out each space-separated word separately and fontkit reverses glyphs per word only,
 * so we reverse the order of RTL runs/words ourselves and mirror brackets. Latin/number runs keep
 * their internal order. This covers labels, names and amounts; it is not a full UAX#9 implementation.
 */
export function visualRtl(text: string): string {
  if (!ARABIC_RE.test(text)) return text
  const runs: { rtl: boolean; words: string[] }[] = []
  for (const w of text.split(" ")) {
    const hasArabic = ARABIC_RE.test(w)
    const neutral = !/[A-Za-z0-9\u0600-\u06FF\u0750-\u077F]/.test(w) // punctuation-only token: follows the current run
    const rtl = hasArabic || (neutral && (runs.at(-1)?.rtl ?? true))
    const last = runs.at(-1)
    if (last && last.rtl === rtl) last.words.push(w)
    else runs.push({ rtl, words: [w] })
  }
  runs.reverse()
  // fontkit reverses each Arabic word *including its trailing space*, which visually moves the space to
  // the word's left. An RTL run followed by an LTR run therefore needs one extra separator.
  return runs.map((r, i) => (r.rtl ? r.words.reverse().map((w) => w.replace(/[()[\]{}«»<>]/g, (c) => MIRROR[c] ?? c)).join(" ") + (i < runs.length - 1 ? " " : "") : r.words.join(" "))).join(" ")
}

/** Helvetica (WinAnsi) has no U+2212; use ASCII hyphen-minus in generated documents. */
const ascii = (s: string) => s.replace(/\u2212/g, "-")

export interface PdfMeta {
  title: string
  business: { name: string; address?: string | null; phone?: string | null; taxNumber?: string | null; ice?: string | null }
  subtitle?: string
  locale: Locale
  generatedLabel: string
  pageLabel: string
}

export type Align = "left" | "right" | "center"
export interface Column<T> {
  header: string
  width: number // relative weight
  align?: Align
  cell: (row: T) => string
}

const PAGE = { width: 595.28, height: 841.89, margin: 40 } // A4 portrait

export class ReportPdf {
  readonly doc: PDFKit.PDFDocument
  private readonly chunks: Buffer[] = []
  private readonly done: Promise<Buffer>
  private pageNo = 1
  private readonly meta: PdfMeta

  constructor(meta: PdfMeta) {
    this.meta = meta
    this.doc = new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true, info: { Title: meta.title, Author: meta.business.name, Creator: "RetailOS Morocco" } })
    const fonts = arabicFonts()
    if (fonts) {
      this.doc.registerFont("Arabic", fonts.regular)
      this.doc.registerFont("Arabic-Bold", fonts.bold)
    }
    this.done = new Promise<Buffer>((resolve, reject) => {
      this.doc.on("data", (c: Buffer) => this.chunks.push(c))
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)))
      this.doc.on("error", reject)
    })
    this.doc.on("pageAdded", () => {
      this.pageNo++
      this.header()
    })
    this.header()
  }

  /** Draws text with the right font (Helvetica or Amiri for Arabic) and RTL visual ordering. */
  write(text: string, x: number, y: number | undefined, opts: PDFKit.Mixins.TextOptions & { bold?: boolean; size?: number; color?: string } = {}) {
    const { bold, size, color, ...textOpts } = opts
    const arabic = ARABIC_RE.test(text) && arabicFonts()
    this.doc.font(arabic ? (bold ? "Arabic-Bold" : "Arabic") : bold ? "Helvetica-Bold" : "Helvetica").fontSize(size ?? 9).fillColor(color ?? "#111")
    this.doc.text(visualRtl(ascii(text)), x, y, textOpts)
    this.doc.fillColor("#111")
  }

  private header() {
    const { doc, meta } = this
    const top = 28
    this.write(meta.business.name, PAGE.margin, top, { width: 300, bold: true, size: 14 })
    const line2 = [meta.business.address, meta.business.phone].filter(Boolean).join(" · ")
    if (line2) this.write(line2, PAGE.margin, top + 18, { width: 320, size: 8, color: "#555" })
    const ids = [meta.business.ice ? `ICE ${meta.business.ice}` : null, meta.business.taxNumber ? `IF ${meta.business.taxNumber}` : null].filter(Boolean).join(" · ")
    if (ids) this.write(ids, PAGE.margin, top + 30, { width: 320, size: 8, color: "#555" })
    this.write(meta.title, PAGE.width - PAGE.margin - 240, top, { width: 240, align: "right", bold: true, size: 13 })
    if (meta.subtitle) this.write(meta.subtitle, PAGE.width - PAGE.margin - 240, top + 18, { width: 240, align: "right", size: 9, color: "#555" })
    doc.moveTo(PAGE.margin, top + 48).lineTo(PAGE.width - PAGE.margin, top + 48).lineWidth(0.8).strokeColor("#999").stroke()
    doc.y = top + 60
  }

  section(title: string) {
    this.ensureSpace(30)
    this.doc.moveDown(0.6)
    this.write(title, PAGE.margin, undefined, { bold: true, size: 11 })
    this.doc.moveDown(0.3)
  }

  paragraph(text: string, opts: { color?: string; size?: number } = {}) {
    this.ensureSpace(20)
    this.write(text, PAGE.margin, undefined, { width: PAGE.width - 2 * PAGE.margin, size: opts.size ?? 9, color: opts.color ?? "#333" })
  }

  /** Two-column key/value block (label left, value right-aligned). Bold rows emphasise totals. */
  keyValues(rows: { label: string; value: string; bold?: boolean; indent?: boolean }[], width = 300) {
    const x = PAGE.margin
    for (const r of rows) {
      this.ensureSpace(16)
      const y = this.doc.y
      this.write(r.label, x + (r.indent ? 14 : 0), y, { width: width - 120 - (r.indent ? 14 : 0), bold: r.bold, color: r.bold ? "#111" : "#333" })
      this.write(r.value, x + width - 120, y, { width: 120, align: "right", bold: r.bold })
      this.doc.y = y + 14
    }
    this.doc.moveDown(0.4)
  }

  table<T>(columns: Column<T>[], rows: T[], opts: { footer?: (string | null)[]; zebra?: boolean } = {}) {
    const { doc } = this
    const totalWeight = columns.reduce((a, c) => a + c.width, 0)
    const usable = PAGE.width - 2 * PAGE.margin
    const widths = columns.map((c) => (c.width / totalWeight) * usable)
    const rowH = 16
    const drawRow = (cells: (string | null)[], y: number, bold: boolean, fill?: string) => {
      if (fill) doc.rect(PAGE.margin, y - 2, usable, rowH).fillColor(fill).fill()
      let x = PAGE.margin
      cells.forEach((cell, i) => {
        this.write(cell ?? "", x + 4, y + 1, { width: widths[i] - 8, align: columns[i].align ?? "left", lineBreak: false, ellipsis: true, bold, size: 8.5 })
        x += widths[i]
      })
    }
    const drawHeader = () => {
      const y = doc.y
      drawRow(columns.map((c) => c.header), y, true, "#e8e8e8")
      doc.y = y + rowH
    }
    this.ensureSpace(rowH * 3)
    drawHeader()
    rows.forEach((r, idx) => {
      if (doc.y + rowH > PAGE.height - PAGE.margin - 20) {
        doc.addPage()
        drawHeader()
      }
      const y = doc.y
      drawRow(columns.map((c) => c.cell(r)), y, false, opts.zebra !== false && idx % 2 === 1 ? "#f6f6f6" : undefined)
      doc.y = y + rowH
    })
    if (opts.footer) {
      this.ensureSpace(rowH + 4)
      const y = doc.y
      doc.moveTo(PAGE.margin, y - 1).lineTo(PAGE.width - PAGE.margin, y - 1).lineWidth(0.6).strokeColor("#333").stroke()
      drawRow(opts.footer, y + 1, true)
      doc.y = y + rowH + 2
    }
    doc.moveDown(0.5)
  }

  private ensureSpace(h: number) {
    if (this.doc.y + h > PAGE.height - PAGE.margin - 20) this.doc.addPage()
  }

  /** Writes footers on every buffered page, then finalises the document. */
  async finish(): Promise<Buffer> {
    const { doc, meta } = this
    const range = doc.bufferedPageRange()
    const total = range.start + range.count
    for (let i = range.start; i < total; i++) {
      doc.switchToPage(i)
      const y = PAGE.height - 28
      // The footer sits inside the bottom margin; pdfkit would auto-add a page when text crosses
      // page.maxY(), so lift the margin while writing it.
      const bottom = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      this.write(`${meta.generatedLabel} · RetailOS Morocco`, PAGE.margin, y, { lineBreak: false, size: 7.5, color: "#888" })
      this.write(`${meta.pageLabel} ${i + 1}/${total}`, PAGE.width - PAGE.margin - 100, y, { width: 100, align: "right", lineBreak: false, size: 7.5, color: "#888" })
      doc.page.margins.bottom = bottom
    }
    doc.end()
    return this.done
  }
}

/**
 * Thermal-style receipt (80 mm wide). Use `ReceiptPdf.render(draw)`: the content is drawn once on a
 * tall page to measure it, then again on a page cut to the exact height (no wasted paper).
 */
export class ReceiptPdf {
  readonly doc: PDFKit.PDFDocument
  private readonly chunks: Buffer[] = []
  private readonly done: Promise<Buffer>
  static readonly WIDTH = 226.77 // 80 mm in points
  private readonly margin = 12

  static async render(draw: (pdf: ReceiptPdf) => void): Promise<Buffer> {
    const probe = new ReceiptPdf(5000)
    draw(probe)
    const height = Math.max(120, Math.ceil(probe.doc.y + probe.margin))
    probe.doc.end()
    await probe.done
    const pdf = new ReceiptPdf(height)
    draw(pdf)
    return pdf.finish()
  }

  constructor(height: number) {
    this.doc = new PDFDocument({ size: [ReceiptPdf.WIDTH, height], margin: this.margin, info: { Creator: "RetailOS Morocco" } })
    const fonts = arabicFonts()
    if (fonts) {
      this.doc.registerFont("Arabic", fonts.regular)
      this.doc.registerFont("Arabic-Bold", fonts.bold)
    }
    this.done = new Promise<Buffer>((resolve, reject) => {
      this.doc.on("data", (c: Buffer) => this.chunks.push(c))
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)))
      this.doc.on("error", reject)
    })
  }
  private write(text: string, x: number, y: number | undefined, opts: PDFKit.Mixins.TextOptions & { bold?: boolean; size?: number; color?: string } = {}) {
    const { bold, size, color, ...textOpts } = opts
    const arabic = ARABIC_RE.test(text) && arabicFonts()
    this.doc.font(arabic ? (bold ? "Arabic-Bold" : "Arabic") : bold ? "Helvetica-Bold" : "Helvetica").fontSize(size ?? 8).fillColor(color ?? "#000")
    this.doc.text(visualRtl(ascii(text)), x, y, textOpts)
    this.doc.fillColor("#000")
  }
  get innerWidth() {
    return ReceiptPdf.WIDTH - 2 * this.margin
  }
  center(text: string, size = 8, bold = false) {
    this.write(text, this.margin, undefined, { width: this.innerWidth, align: "center", size, bold })
  }
  line(left: string, right: string, opts: { bold?: boolean; size?: number } = {}) {
    const y = this.doc.y
    const size = opts.size ?? 8
    this.write(left, this.margin, y, { width: this.innerWidth - 70, lineBreak: false, ellipsis: true, size, bold: opts.bold })
    this.write(right, this.margin + this.innerWidth - 70, y, { width: 70, align: "right", lineBreak: false, size, bold: opts.bold })
    this.doc.y = y + size + 4
  }
  text(text: string, size = 7.5, color = "#333") {
    this.write(text, this.margin, undefined, { width: this.innerWidth, size, color })
  }
  dashed() {
    const y = this.doc.y + 2
    this.doc.moveTo(this.margin, y).lineTo(ReceiptPdf.WIDTH - this.margin, y).dash(2, { space: 2 }).lineWidth(0.5).strokeColor("#000").stroke().undash()
    this.doc.y = y + 6
  }
  async finish(): Promise<Buffer> {
    this.doc.end()
    return this.done
  }
}

/** CSV with UTF-8 BOM so Excel opens accents correctly; semicolon separator for FR locales. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][], separator = ";"): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v)
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return "\uFEFF" + [headers.map(esc).join(separator), ...rows.map((r) => r.map(esc).join(separator))].join("\r\n")
}
