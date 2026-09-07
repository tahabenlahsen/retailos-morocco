import type { Prisma } from "@prisma/client"
import Papa from "papaparse"
import { prisma, icontains } from "@/lib/prisma"
import { conflict, forbidden, notFound, validation } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"
import { resolveStoreId } from "@/lib/api"
import { productImportRowSchema } from "@/utils/validation"
import type { z } from "zod"
import type { createProductSchema, updateProductSchema, productListQuerySchema, bulkPriceUpdateSchema, bulkStockUpdateSchema } from "@/utils/validation"
import { applyStockChange } from "./inventory.service"
import { round2 } from "@/utils/money"
import { notificationService } from "./notification.service"

type CreateInput = z.infer<typeof createProductSchema>
type UpdateInput = z.infer<typeof updateProductSchema>
type ListQuery = z.infer<typeof productListQuerySchema>

const productInclude = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  store: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude

async function assertRefs(businessId: string, refs: { categoryId?: string; brandId?: string | null; supplierId?: string | null }) {
  if (refs.categoryId) {
    const c = await prisma.category.findFirst({ where: { id: refs.categoryId, businessId, deletedAt: null } })
    if (!c) throw validation("Invalid category")
  }
  if (refs.brandId) {
    const b = await prisma.brand.findFirst({ where: { id: refs.brandId, businessId, deletedAt: null } })
    if (!b) throw validation("Invalid brand")
  }
  if (refs.supplierId) {
    const s = await prisma.supplier.findFirst({ where: { id: refs.supplierId, businessId, deletedAt: null } })
    if (!s) throw validation("Invalid supplier")
  }
}

async function assertUnique(storeId: string, sku: string | undefined, barcode: string | null | undefined, excludeId?: string) {
  if (sku) {
    const dup = await prisma.product.findFirst({ where: { storeId, sku, deletedAt: null, NOT: excludeId ? { id: excludeId } : undefined } })
    if (dup) throw conflict(`A product with SKU "${sku}" already exists in this store`)
  }
  if (barcode) {
    const dup = await prisma.product.findFirst({ where: { storeId, barcode, deletedAt: null, NOT: excludeId ? { id: excludeId } : undefined } })
    if (dup) throw conflict(`A product with barcode "${barcode}" already exists in this store`)
  }
}

export const productService = {
  async list(ctx: TenantContext, q: ListQuery) {
    if (q.storeId && !ctx.storeIds.includes(q.storeId)) throw forbidden("You do not have access to this store")
    const where: Prisma.ProductWhereInput = {
      businessId: ctx.businessId,
      storeId: q.storeId ?? { in: ctx.storeIds },
      deletedAt: null,
      categoryId: q.categoryId,
      brandId: q.brandId,
      supplierId: q.supplierId,
      isActive: q.isActive ? q.isActive === "true" : undefined,
      OR: q.search
        ? [{ name: icontains(q.search) }, { sku: icontains(q.search) }, { barcode: icontains(q.search) }]
        : undefined,
    }
    // Low-stock filter needs a column comparison; Prisma can't express stock <= minimumStock directly,
    // so we fetch candidates and filter in memory (bounded by pageSize after filter).
    if (q.lowStock === "true") {
      const all = await prisma.product.findMany({ where, include: productInclude, orderBy: { [q.sortBy]: q.sortDir } })
      const low = all.filter((p) => p.stockQuantity <= p.minimumStock)
      return { items: low.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: low.length, page: q.page, pageSize: q.pageSize }
    }
    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({ where, include: productInclude, orderBy: { [q.sortBy]: q.sortDir }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ])
    return { items, total, page: q.page, pageSize: q.pageSize }
  },

  /** Full active catalogue of a store (light fields) — downloaded by the POS for offline scanning. */
  async catalog(ctx: TenantContext, storeId: string | undefined) {
    const sid = resolveStoreId(ctx, storeId)
    const items = await prisma.product.findMany({
      where: { businessId: ctx.businessId, storeId: sid, deletedAt: null, isActive: true },
      select: { id: true, name: true, sku: true, barcode: true, sellingPrice: true, taxRate: true, stockQuantity: true, unit: true, image: true, category: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
      take: 5000,
    })
    return { storeId: sid, at: new Date().toISOString(), items }
  },

  /** Fast lookup for POS: exact barcode or SKU match, then name search. */
  async lookup(ctx: TenantContext, storeId: string | undefined, term: string, limit = 20) {
    const sid = resolveStoreId(ctx, storeId)
    const base = { businessId: ctx.businessId, storeId: sid, deletedAt: null, isActive: true }
    const exact = await prisma.product.findFirst({ where: { ...base, OR: [{ barcode: term }, { sku: term }] }, include: productInclude })
    if (exact) return { exact: true, items: [exact] }
    const items = await prisma.product.findMany({
      where: { ...base, OR: [{ name: icontains(term) }, { sku: icontains(term) }, { barcode: icontains(term) }] },
      include: productInclude,
      take: limit,
      orderBy: { name: "asc" },
    })
    return { exact: false, items }
  },

  async getById(ctx: TenantContext, id: string) {
    const p = await prisma.product.findFirst({ where: { id, businessId: ctx.businessId, storeId: { in: ctx.storeIds }, deletedAt: null }, include: productInclude })
    if (!p) throw notFound("Product")
    return p
  },

  async create(ctx: TenantContext, input: CreateInput) {
    const storeId = resolveStoreId(ctx, input.storeId)
    await assertRefs(ctx.businessId, input)
    await assertUnique(storeId, input.sku, input.barcode)
    const { storeId: _s, stockQuantity, ...data } = input
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: { ...data, barcode: data.barcode ?? null, costPrice: data.purchasePrice, stockQuantity: 0, businessId: ctx.businessId, storeId },
      })
      if (stockQuantity > 0) {
        await applyStockChange(tx, ctx, { productId: p.id, delta: stockQuantity, type: "ADJUSTMENT", reason: "Initial stock" })
      }
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "PRODUCT_CREATED", entityType: "Product", entityId: p.id, metadata: { name: p.name, sku: p.sku }, ipAddress: ctx.ip }, tx)
      return tx.product.findUniqueOrThrow({ where: { id: p.id }, include: productInclude })
    })
    return product
  },

  async update(ctx: TenantContext, id: string, input: UpdateInput) {
    const existing = await this.getById(ctx, id)
    await assertRefs(ctx.businessId, input)
    await assertUnique(existing.storeId, input.sku, input.barcode, id)
    const priceChanged = (input.sellingPrice != null && input.sellingPrice !== existing.sellingPrice) || (input.purchasePrice != null && input.purchasePrice !== existing.purchasePrice)
    return prisma.$transaction(async (tx) => {
      const p = await tx.product.update({ where: { id }, data: input, include: productInclude })
      await writeAuditLog(
        { businessId: ctx.businessId, userId: ctx.userId, action: priceChanged ? "PRODUCT_PRICE_CHANGED" : "PRODUCT_UPDATED", entityType: "Product", entityId: id, metadata: priceChanged ? { from: { selling: existing.sellingPrice, purchase: existing.purchasePrice }, to: { selling: p.sellingPrice, purchase: p.purchasePrice } } : { fields: Object.keys(input) }, ipAddress: ctx.ip },
        tx
      )
      return p
    })
  },

  /** Soft delete. Products with sales history are kept for reporting integrity. */
  async remove(ctx: TenantContext, id: string) {
    const existing = await this.getById(ctx, id)
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "PRODUCT_DELETED", entityType: "Product", entityId: id, metadata: { name: existing.name, sku: existing.sku }, ipAddress: ctx.ip }, tx)
    })
  },

  async bulkPrice(ctx: TenantContext, input: z.infer<typeof bulkPriceUpdateSchema>) {
    const products = await prisma.product.findMany({ where: { id: { in: input.productIds }, businessId: ctx.businessId, storeId: { in: ctx.storeIds }, deletedAt: null } })
    if (products.length !== input.productIds.length) throw validation("Some products were not found")
    const updates = products.map((p) => {
      const current = p[input.field]
      let next: number
      if (input.mode === "SET") next = input.value
      else if (input.mode === "PERCENT") next = current * (1 + input.value / 100)
      else next = current + input.value
      next = round2(next)
      if (next < 0) throw validation(`Resulting price for ${p.name} would be negative`)
      return { id: p.id, from: current, to: next }
    })
    await prisma.$transaction(async (tx) => {
      for (const u of updates) await tx.product.update({ where: { id: u.id }, data: { [input.field]: u.to } })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "PRODUCT_BULK_UPDATED", entityType: "Product", entityId: "bulk", metadata: { field: input.field, mode: input.mode, value: input.value, count: updates.length }, ipAddress: ctx.ip }, tx)
    })
    return { updated: updates.length }
  },

  async bulkStock(ctx: TenantContext, input: z.infer<typeof bulkStockUpdateSchema>) {
    const ids = input.items.map((i) => i.productId)
    const products = await prisma.product.findMany({ where: { id: { in: ids }, businessId: ctx.businessId, storeId: { in: ctx.storeIds }, deletedAt: null } })
    if (products.length !== ids.length) throw validation("Some products were not found")
    const map = new Map(products.map((p) => [p.id, p]))
    await prisma.$transaction(async (tx) => {
      for (const it of input.items) {
        const p = map.get(it.productId)!
        const delta = it.newQuantity - p.stockQuantity
        if (delta !== 0) await applyStockChange(tx, ctx, { productId: p.id, delta, type: "ADJUSTMENT", reason: input.reason })
      }
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "PRODUCT_BULK_UPDATED", entityType: "Product", entityId: "bulk", metadata: { stock: true, count: input.items.length, reason: input.reason }, ipAddress: ctx.ip }, tx)
    })
    void Promise.all(ids.map((id) => notificationService.checkStockLevel(ctx.businessId, id))).catch(() => {})
    return { updated: input.items.length }
  },

  /**
   * CSV import. Columns: name, sku, barcode, category, brand, purchasePrice, sellingPrice, taxRate, stockQuantity, minimumStock, unit.
   * Rows are validated individually; valid rows are imported in one transaction, invalid rows are reported.
   * Existing SKUs (same store) are updated (prices/min stock); stock is adjusted to the given value.
   */
  async importCsv(ctx: TenantContext, storeId: string | undefined, csv: string) {
    const sid = resolveStoreId(ctx, storeId)
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() })
    if (parsed.errors.length && !parsed.data.length) throw validation("Could not parse CSV", parsed.errors.map((e) => e.message))
    if (parsed.data.length > 2000) throw validation("CSV is limited to 2000 rows per import")

    const errors: { row: number; message: string }[] = []
    const rows: z.infer<typeof productImportRowSchema>[] = []
    parsed.data.forEach((raw, i) => {
      const r = productImportRowSchema.safeParse(raw)
      if (r.success) rows.push(r.data)
      else errors.push({ row: i + 2, message: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") })
    })

    // Duplicate SKUs/barcodes within the file
    const seenSku = new Set<string>()
    const seenBarcode = new Set<string>()
    rows.forEach((r, i) => {
      if (seenSku.has(r.sku)) errors.push({ row: i + 2, message: `Duplicate SKU in file: ${r.sku}` })
      seenSku.add(r.sku)
      if (r.barcode) {
        if (seenBarcode.has(r.barcode)) errors.push({ row: i + 2, message: `Duplicate barcode in file: ${r.barcode}` })
        seenBarcode.add(r.barcode)
      }
    })
    const validRows = rows.filter((r) => !errors.some((e) => e.message.includes(r.sku)))

    let createdCount = 0
    let updatedCount = 0
    await prisma.$transaction(async (tx) => {
      const categories = new Map((await tx.category.findMany({ where: { businessId: ctx.businessId, deletedAt: null } })).map((c) => [c.name.toLowerCase(), c.id]))
      const brands = new Map((await tx.brand.findMany({ where: { businessId: ctx.businessId, deletedAt: null } })).map((b) => [b.name.toLowerCase(), b.id]))
      for (const r of validRows) {
        let categoryId = categories.get(r.category.toLowerCase())
        if (!categoryId) {
          categoryId = (await tx.category.create({ data: { name: r.category, businessId: ctx.businessId } })).id
          categories.set(r.category.toLowerCase(), categoryId)
        }
        let brandId: string | null = null
        if (r.brand) {
          brandId = brands.get(r.brand.toLowerCase()) ?? null
          if (!brandId) {
            brandId = (await tx.brand.create({ data: { name: r.brand, businessId: ctx.businessId } })).id
            brands.set(r.brand.toLowerCase(), brandId)
          }
        }
        const barcode = r.barcode || null
        if (barcode) {
          const clash = await tx.product.findFirst({ where: { storeId: sid, barcode, deletedAt: null, NOT: { sku: r.sku } } })
          if (clash) {
            errors.push({ row: 0, message: `Barcode ${barcode} already used by SKU ${clash.sku}` })
            continue
          }
        }
        const existing = await tx.product.findFirst({ where: { storeId: sid, sku: r.sku, deletedAt: null } })
        if (existing) {
          await tx.product.update({ where: { id: existing.id }, data: { name: r.name, barcode, categoryId, brandId, purchasePrice: r.purchasePrice, sellingPrice: r.sellingPrice, taxRate: r.taxRate, minimumStock: r.minimumStock, unit: r.unit } })
          const delta = r.stockQuantity - existing.stockQuantity
          if (delta !== 0) await applyStockChange(tx, ctx, { productId: existing.id, delta, type: "ADJUSTMENT", reason: "CSV import" })
          updatedCount++
        } else {
          const p = await tx.product.create({ data: { name: r.name, sku: r.sku, barcode, categoryId, brandId, purchasePrice: r.purchasePrice, costPrice: r.purchasePrice, sellingPrice: r.sellingPrice, taxRate: r.taxRate, minimumStock: r.minimumStock, unit: r.unit, stockQuantity: 0, businessId: ctx.businessId, storeId: sid } })
          if (r.stockQuantity > 0) await applyStockChange(tx, ctx, { productId: p.id, delta: r.stockQuantity, type: "ADJUSTMENT", reason: "CSV import (initial stock)" })
          createdCount++
        }
      }
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "PRODUCT_IMPORTED", entityType: "Product", entityId: "import", metadata: { created: createdCount, updated: updatedCount, errors: errors.length }, ipAddress: ctx.ip }, tx)
    })
    return { created: createdCount, updated: updatedCount, errors }
  },

  async exportCsv(ctx: TenantContext, storeId?: string) {
    const sid = resolveStoreId(ctx, storeId)
    const products = await prisma.product.findMany({ where: { businessId: ctx.businessId, storeId: sid, deletedAt: null }, include: { category: true, brand: true, supplier: true }, orderBy: { name: "asc" } })
    return Papa.unparse(
      products.map((p) => ({
        name: p.name,
        sku: p.sku,
        barcode: p.barcode ?? "",
        category: p.category.name,
        brand: p.brand?.name ?? "",
        supplier: p.supplier?.name ?? "",
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        taxRate: p.taxRate,
        stockQuantity: p.stockQuantity,
        minimumStock: p.minimumStock,
        maximumStock: p.maximumStock ?? "",
        unit: p.unit,
        isActive: p.isActive ? "true" : "false",
      }))
    )
  },

  // ---------- Categories & brands ----------
  async listCategories(ctx: TenantContext) {
    return prisma.category.findMany({ where: { businessId: ctx.businessId, deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { products: { where: { deletedAt: null } } } } } })
  },
  async createCategory(ctx: TenantContext, input: { name: string; description?: string; parentId?: string | null }) {
    if (input.parentId) {
      const parent = await prisma.category.findFirst({ where: { id: input.parentId, businessId: ctx.businessId, deletedAt: null } })
      if (!parent) throw validation("Invalid parent category")
    }
    const dup = await prisma.category.findFirst({ where: { businessId: ctx.businessId, name: input.name, deletedAt: null } })
    if (dup) throw conflict("A category with this name already exists")
    return prisma.category.create({ data: { ...input, businessId: ctx.businessId } })
  },
  async updateCategory(ctx: TenantContext, id: string, input: { name?: string; description?: string; parentId?: string | null; isActive?: boolean }) {
    const c = await prisma.category.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!c) throw notFound("Category")
    if (input.parentId === id) throw validation("A category cannot be its own parent")
    return prisma.category.update({ where: { id }, data: input })
  },
  async deleteCategory(ctx: TenantContext, id: string) {
    const c = await prisma.category.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null }, include: { _count: { select: { products: { where: { deletedAt: null } } } } } })
    if (!c) throw notFound("Category")
    if (c._count.products > 0) throw conflict("Cannot delete a category that still has products")
    return prisma.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
  },
  async listBrands(ctx: TenantContext) {
    return prisma.brand.findMany({ where: { businessId: ctx.businessId, deletedAt: null }, orderBy: { name: "asc" } })
  },
  async createBrand(ctx: TenantContext, input: { name: string; description?: string; website?: string }) {
    const dup = await prisma.brand.findFirst({ where: { businessId: ctx.businessId, name: input.name, deletedAt: null } })
    if (dup) throw conflict("A brand with this name already exists")
    return prisma.brand.create({ data: { ...input, businessId: ctx.businessId } })
  },
  async updateBrand(ctx: TenantContext, id: string, input: { name?: string; description?: string; website?: string; isActive?: boolean }) {
    const b = await prisma.brand.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!b) throw notFound("Brand")
    return prisma.brand.update({ where: { id }, data: input })
  },
  async deleteBrand(ctx: TenantContext, id: string) {
    const b = await prisma.brand.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!b) throw notFound("Brand")
    await prisma.product.updateMany({ where: { brandId: id }, data: { brandId: null } })
    return prisma.brand.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
  },
}
