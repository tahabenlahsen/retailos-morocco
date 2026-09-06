import { z } from "zod"

// ============================================================
// SHARED ENUMS (mirrors the documented string enums in schema.prisma)
// ============================================================

export const BUSINESS_TYPES = [
  "MINI_MARKET",
  "GROCERY",
  "CLOTHING",
  "ELECTRONICS",
  "COSMETICS",
  "RESTAURANT",
  "PHARMACY",
  "OTHER",
] as const
export const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "CHECK", "OTHER"] as const
export const PURCHASE_STATUSES = ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const
export const MOVEMENT_TYPES = ["SALE", "PURCHASE", "RETURN", "ADJUSTMENT", "TRANSFER", "DAMAGE", "LOSS"] as const
export const REGISTER_TX_TYPES = ["WITHDRAWAL", "DEPOSIT"] as const
export const ROLE_NAMES = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "INVENTORY_MANAGER", "ACCOUNTANT"] as const
export const LOCALES = ["fr", "ar", "en"] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number]
export type MovementType = (typeof MOVEMENT_TYPES)[number]

const uuid = z.string().uuid()
const money = z.number().finite().nonnegative()
const positiveMoney = z.number().finite().positive()
const optionalTrimmed = z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined))
const email = z.string().trim().toLowerCase().email().max(255)
const phone = z.string().trim().min(6).max(30)
const rate = z.number().min(0).max(1)

// ============================================================
// AUTH
// ============================================================

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number")

export const signUpSchema = z.object({
  email,
  password: passwordSchema,
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
  locale: z.enum(LOCALES).default("fr"),
})

export const signInSchema = z.object({
  email,
  password: z.string().min(1).max(128),
})

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})

// ============================================================
// BUSINESS / STORE
// ============================================================

export const businessOnboardingSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  businessType: z.enum(BUSINESS_TYPES),
  ownerName: z.string().trim().min(2).max(120),
  phone,
  email,
  city: z.string().trim().min(2).max(80),
  address: optionalTrimmed,
  currency: z.string().trim().length(3).default("MAD"),
  taxRate: rate.default(0.2),
  storeName: z.string().trim().min(2).max(120),
})

export const updateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  type: z.enum(BUSINESS_TYPES).optional(),
  ownerName: z.string().trim().min(2).max(120).optional(),
  phone: phone.optional(),
  email: email.optional(),
  city: z.string().trim().min(2).max(80).optional(),
  address: optionalTrimmed,
  logo: z.string().url().max(500).optional().nullable(),
  taxRate: rate.optional(),
})

export const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
  email: email.optional().or(z.literal("").transform(() => undefined)),
  address: optionalTrimmed,
  city: z.string().trim().min(2).max(80),
  size: z.number().positive().max(100000).optional(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
})

export const updateStoreSchema = createStoreSchema.partial().extend({ isActive: z.boolean().optional() })

// ============================================================
// USERS (employees)
// ============================================================

export const createUserSchema = z.object({
  email,
  password: passwordSchema,
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
  role: z.enum(ROLE_NAMES),
  storeIds: z.array(uuid).min(1, "Assign at least one store"),
})

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(2).max(60).optional(),
  lastName: z.string().trim().min(2).max(60).optional(),
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
  role: z.enum(ROLE_NAMES).optional(),
  storeIds: z.array(uuid).min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  password: passwordSchema.optional(),
})

// ============================================================
// CATALOG
// ============================================================

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optionalTrimmed,
  parentId: uuid.optional().nullable(),
})
export const updateCategorySchema = createCategorySchema.partial().extend({ isActive: z.boolean().optional() })

export const createBrandSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optionalTrimmed,
  website: z.string().url().max(300).optional().or(z.literal("").transform(() => undefined)),
})
export const updateBrandSchema = createBrandSchema.partial().extend({ isActive: z.boolean().optional() })

export const productBaseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().min(3).max(64).optional().or(z.literal("").transform(() => undefined)),
  description: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  image: z.string().url().max(500).optional().or(z.literal("").transform(() => undefined)),
  purchasePrice: money,
  sellingPrice: money,
  taxRate: rate.default(0.2),
  stockQuantity: z.number().int().min(0).default(0),
  minimumStock: z.number().int().min(0).default(0),
  maximumStock: z.number().int().positive().optional().nullable(),
  unit: z.string().trim().min(1).max(20).default("piece"),
  categoryId: uuid,
  brandId: uuid.optional().nullable(),
  supplierId: uuid.optional().nullable(),
  storeId: uuid.optional(),
})

const maxGteMin = { message: "Maximum stock must be greater than or equal to minimum stock", path: ["maximumStock"] }
export const createProductSchema = productBaseSchema.refine((d) => d.maximumStock == null || d.maximumStock >= d.minimumStock, maxGteMin)

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  sku: z.string().trim().min(1).max(64).optional(),
  barcode: z.string().trim().min(3).max(64).optional().nullable().or(z.literal("").transform(() => null)),
  description: z.string().trim().max(2000).optional().nullable(),
  image: z.string().url().max(500).optional().nullable().or(z.literal("").transform(() => null)),
  purchasePrice: money.optional(),
  sellingPrice: money.optional(),
  taxRate: rate.optional(),
  minimumStock: z.number().int().min(0).optional(),
  maximumStock: z.number().int().positive().optional().nullable(),
  unit: z.string().trim().min(1).max(20).optional(),
  categoryId: uuid.optional(),
  brandId: uuid.optional().nullable(),
  supplierId: uuid.optional().nullable(),
  isActive: z.boolean().optional(),
})

export const bulkPriceUpdateSchema = z.object({
  productIds: z.array(uuid).min(1).max(500),
  mode: z.enum(["SET", "PERCENT", "AMOUNT"]),
  field: z.enum(["sellingPrice", "purchasePrice"]),
  value: z.number().finite(),
})

export const bulkStockUpdateSchema = z.object({
  items: z
    .array(z.object({ productId: uuid, newQuantity: z.number().int().min(0) }))
    .min(1)
    .max(500),
  reason: z.string().trim().min(2).max(300),
})

export const productImportRowSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().max(64).optional(),
  category: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(80).optional(),
  purchasePrice: z.coerce.number().finite().nonnegative(),
  sellingPrice: z.coerce.number().finite().nonnegative(),
  taxRate: z.coerce.number().min(0).max(1).default(0.2),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  minimumStock: z.coerce.number().int().min(0).default(0),
  unit: z.string().trim().max(20).default("piece"),
})

export const productListQuerySchema = z.object({
  storeId: uuid.optional(),
  search: z.string().trim().max(120).optional(),
  categoryId: uuid.optional(),
  brandId: uuid.optional(),
  supplierId: uuid.optional(),
  lowStock: z.enum(["true", "false"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z.enum(["name", "sellingPrice", "stockQuantity", "createdAt"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
})

// ============================================================
// INVENTORY
// ============================================================

export const stockAdjustmentSchema = z.object({
  productId: uuid,
  type: z.enum(["ADJUSTMENT", "DAMAGE", "LOSS", "RETURN"]),
  /** For ADJUSTMENT: absolute new quantity. For DAMAGE/LOSS/RETURN: quantity delta (positive). */
  quantity: z.number().int(),
  reason: z.string().trim().min(2).max(300),
})

export const inventoryTransferSchema = z
  .object({
    productId: uuid,
    fromStoreId: uuid,
    toStoreId: uuid,
    quantity: z.number().int().positive(),
    reason: optionalTrimmed,
  })
  .refine((d) => d.fromStoreId !== d.toStoreId, { message: "Source and destination stores must differ", path: ["toStoreId"] })

export const movementListQuerySchema = z.object({
  storeId: uuid.optional(),
  productId: uuid.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

// ============================================================
// SALES / POS
// ============================================================

export const saleItemInputSchema = z.object({
  productId: uuid,
  quantity: z.number().int().positive().max(100000),
  /** Optional price override (manager discount). If omitted, product price is used. */
  unitPrice: money.optional(),
  /** Absolute discount amount on the line, in currency. */
  discount: money.default(0),
})

export const paymentInputSchema = z.object({
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
})

export const createSaleSchema = z.object({
  storeId: uuid.optional(),
  items: z.array(saleItemInputSchema).min(1).max(200),
  customerId: uuid.optional().nullable(),
  /** Order-level discount amount in currency. */
  discountAmount: money.default(0),
  payments: z.array(paymentInputSchema).min(1).max(10),
  notes: z.string().trim().max(500).optional(),
  /** Client-generated key to make sale creation idempotent (prevents duplicate transactions). */
  idempotencyKey: z.string().trim().min(8).max(100),
})

export const refundSchema = z.object({
  items: z.array(z.object({ saleItemId: uuid, quantity: z.number().int().positive() })).min(1),
  reason: z.string().trim().min(2).max(300),
  paymentMethod: z.enum(PAYMENT_METHODS).default("CASH"),
  /** If true, items are restocked. False for damaged goods. */
  restock: z.boolean().default(true),
})

export const heldCartSchema = z.object({
  storeId: uuid.optional(),
  label: z.string().trim().max(60).optional(),
  customerId: uuid.optional().nullable(),
  items: z.array(saleItemInputSchema).min(1).max(200),
})

export const saleListQuerySchema = z.object({
  storeId: uuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(["COMPLETED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
  customerId: uuid.optional(),
  search: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})

// ============================================================
// CASH REGISTER
// ============================================================

export const openRegisterSchema = z.object({
  storeId: uuid.optional(),
  name: z.string().trim().min(1).max(60).default("Main register"),
  openingBalance: money,
})

export const closeRegisterSchema = z.object({
  actualBalance: money,
  differenceReason: z.string().trim().max(300).optional(),
})

export const registerTransactionSchema = z.object({
  type: z.enum(REGISTER_TX_TYPES),
  amount: positiveMoney,
  reason: z.string().trim().min(2).max(300),
})

// ============================================================
// PURCHASES / SUPPLIERS
// ============================================================

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
  email: email.optional().or(z.literal("").transform(() => undefined)),
  address: optionalTrimmed,
  taxNumber: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
  creditLimit: money.optional().nullable(),
  notes: z.string().trim().max(1000).optional(),
})
export const updateSupplierSchema = createSupplierSchema.partial().extend({ isActive: z.boolean().optional() })

export const purchaseItemInputSchema = z.object({
  productId: uuid,
  quantity: z.number().int().positive().max(1000000),
  unitPrice: money,
  taxRate: rate.default(0.2),
})

export const createPurchaseOrderSchema = z.object({
  storeId: uuid.optional(),
  supplierId: uuid,
  items: z.array(purchaseItemInputSchema).min(1).max(500),
  expectedDelivery: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(["DRAFT", "ORDERED"]).default("DRAFT"),
})

export const updatePurchaseOrderSchema = z.object({
  supplierId: uuid.optional(),
  items: z.array(purchaseItemInputSchema).min(1).max(500).optional(),
  expectedDelivery: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(["DRAFT", "ORDERED", "CANCELLED"]).optional(),
})

export const receivePurchaseOrderSchema = z.object({
  items: z
    .array(z.object({ purchaseOrderItemId: uuid, receivedQuantity: z.number().int().positive() }))
    .min(1),
  /** Update product purchase price with the PO unit price. */
  updatePurchasePrice: z.boolean().default(true),
})

export const supplierPaymentSchema = z.object({
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(300).optional(),
})

// ============================================================
// CUSTOMERS
// ============================================================

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
  email: email.optional().or(z.literal("").transform(() => undefined)),
  address: optionalTrimmed,
  notes: z.string().trim().max(1000).optional(),
})
export const updateCustomerSchema = createCustomerSchema.partial().extend({ isActive: z.boolean().optional() })

export const customerPaymentSchema = z.object({
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  notes: z.string().trim().max(300).optional(),
})

// ============================================================
// EXPENSES
// ============================================================

export const createExpenseSchema = z.object({
  storeId: uuid.optional(),
  amount: positiveMoney,
  categoryId: uuid,
  description: z.string().trim().max(500).optional(),
  date: z.coerce.date().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  notes: z.string().trim().max(1000).optional(),
})
export const updateExpenseSchema = createExpenseSchema.partial()

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalTrimmed,
})

export const expenseListQuerySchema = z.object({
  storeId: uuid.optional(),
  categoryId: uuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})

// ============================================================
// ANALYTICS / DASHBOARD
// ============================================================

export const DATE_PRESETS = ["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth", "custom"] as const

export const dateRangeQuerySchema = z
  .object({
    preset: z.enum(DATE_PRESETS).default("today"),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    storeId: uuid.optional(),
  })
  .refine((d) => d.preset !== "custom" || (d.from && d.to), { message: "from and to are required for custom range" })

// ============================================================
// AI / PLANNER
// ============================================================

export const aiQuerySchema = z.object({
  question: z.string().trim().min(2).max(1000),
  storeId: uuid.optional(),
  locale: z.enum(LOCALES).default("fr"),
})

export const storePlannerSchema = z.object({
  budget: z.number().positive().max(1e9),
  businessType: z.enum(BUSINESS_TYPES),
  city: z.string().trim().min(2).max(80),
  storeSizeM2: z.number().positive().max(100000),
  expectedDailyCustomers: z.number().int().positive().max(100000),
  monthlyRent: z.number().nonnegative().optional(),
  employees: z.number().int().min(0).max(500).default(1),
})

// ============================================================
// NOTIFICATIONS
// ============================================================

export const notificationListQuerySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(120).optional(),
})
