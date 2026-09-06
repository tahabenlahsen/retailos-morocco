/**
 * DEVELOPMENT / DEMO SEED DATA
 * ----------------------------
 * Creates two isolated demo businesses so tenant isolation can be verified,
 * with products, customers, suppliers, sales, expenses and inventory movements.
 * Never run against a production database.
 *
 * Logins (password for all: Demo12345):
 *   owner@demo.ma      OWNER    (Demo Mini Market, 2 stores)
 *   cashier@demo.ma    CASHIER  (Demo Mini Market, store 1)
 *   manager@demo.ma    MANAGER  (Demo Mini Market, both stores)
 *   owner@boutique.ma  OWNER    (Boutique Zahra — separate business)
 */
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient({ transactionOptions: { timeout: 120_000, maxWait: 30_000 } })
const PASSWORD = "Demo12345"
const ROLES = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "INVENTORY_MANAGER", "ACCOUNTANT"]
const EXPENSE_CATS = [
  ["RENT", "Loyer"], ["ELECTRICITY", "Électricité"], ["INTERNET", "Internet"], ["SALARIES", "Salaires"], ["TRANSPORT", "Transport"],
  ["MARKETING", "Marketing"], ["MAINTENANCE", "Maintenance"], ["SUPPLIES", "Fournitures"], ["OTHER", "Autre"],
]

function r2(n: number) { return Math.round(n * 100) / 100 }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function daysAgo(d: number, hour = 10) { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(hour, rand(0, 59), 0, 0); return x }

async function reset() {
  const tables = ["audit_logs", "notifications", "held_carts", "password_reset_tokens", "cash_register_transactions", "refunds", "payments", "sale_items", "sales", "cash_registers", "inventory_movements", "purchase_order_items", "purchase_orders", "expenses", "expense_categories", "products", "categories", "brands", "suppliers", "customers", "user_stores", "users", "stores", "businesses", "roles"]
  for (const t of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`)
}

async function seedBusiness(opts: { name: string; type: string; city: string; ownerEmail: string; stores: string[]; extraUsers?: { email: string; role: string; first: string; last: string; storeIdx: number[] }[]; products: { name: string; sku: string; barcode: string; cat: string; brand?: string; buy: number; sell: number; stock: number; min: number; unit?: string }[]; customers: { name: string; phone: string }[]; suppliers: string[]; salesDays: number }) {
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.name, r.id]))
  const hash = await bcrypt.hash(PASSWORD, 10)
  const business = await prisma.business.create({ data: { name: opts.name, type: opts.type, ownerName: "Demo Owner", phone: "+212600000000", email: opts.ownerEmail, city: opts.city, address: "12 Rue de la Liberté", status: "ACTIVE", subscriptionPlan: "PROFESSIONAL", onboarded: true } })
  const owner = await prisma.user.create({ data: { email: opts.ownerEmail, passwordHash: hash, firstName: "Demo", lastName: "Owner", phone: "+212600000000", status: "ACTIVE", businessId: business.id, roleId: roles.get("OWNER")!, emailVerified: new Date() } })
  const stores: { id: string; name: string }[] = []
  for (const [i, name] of opts.stores.entries()) {
    const s = await prisma.store.create({ data: { name, city: opts.city, address: `${10 + i} Avenue Hassan II`, phone: `+21252000000${i}`, openTime: "08:00", closeTime: "22:00", businessId: business.id } })
    await prisma.userStore.create({ data: { userId: owner.id, storeId: s.id, isDefault: i === 0 } })
    stores.push(s)
  }
  const users = [owner]
  for (const u of opts.extraUsers ?? []) {
    const user = await prisma.user.create({ data: { email: u.email, passwordHash: hash, firstName: u.first, lastName: u.last, status: "ACTIVE", businessId: business.id, roleId: roles.get(u.role)!, emailVerified: new Date() } })
    for (const [j, idx] of u.storeIdx.entries()) await prisma.userStore.create({ data: { userId: user.id, storeId: stores[idx].id, isDefault: j === 0 } })
    users.push(user)
  }
  const catNames = [...new Set(opts.products.map((p) => p.cat))]
  const cats = new Map<string, string>()
  for (const c of catNames) cats.set(c, (await prisma.category.create({ data: { name: c, businessId: business.id } })).id)
  const brandNames = [...new Set(opts.products.map((p) => p.brand).filter(Boolean))] as string[]
  const brands = new Map<string, string>()
  for (const b of brandNames) brands.set(b, (await prisma.brand.create({ data: { name: b, businessId: business.id } })).id)
  const suppliers = []
  for (const s of opts.suppliers) suppliers.push(await prisma.supplier.create({ data: { name: s, phone: `+2125${rand(10000000, 99999999)}`, email: `${s.toLowerCase().replace(/\W+/g, "")}@supplier.ma`, address: opts.city, businessId: business.id } }))
  const expCats = new Map<string, string>()
  for (const [code, name] of EXPENSE_CATS) expCats.set(code, (await prisma.expenseCategory.create({ data: { name, code, businessId: business.id } })).id)
  const customers: { id: string }[] = []
  for (const c of opts.customers) customers.push(await prisma.customer.create({ data: { name: c.name, phone: c.phone, businessId: business.id } }))

  // Products in store 1 (and a subset in store 2) with initial stock movements
  const store1Products: { id: string; sellingPrice: number; purchasePrice: number; stockQuantity: number }[] = []
  for (const [i, p] of opts.products.entries()) {
    const prod = await prisma.product.create({ data: { name: p.name, sku: p.sku, barcode: p.barcode, purchasePrice: p.buy, costPrice: p.buy, sellingPrice: p.sell, taxRate: 0.2, stockQuantity: p.stock, minimumStock: p.min, maximumStock: p.stock * 3, unit: p.unit ?? "pièce", businessId: business.id, storeId: stores[0].id, categoryId: cats.get(p.cat)!, brandId: p.brand ? brands.get(p.brand) : null, supplierId: suppliers[i % suppliers.length]?.id } })
    await prisma.inventoryMovement.create({ data: { productId: prod.id, quantity: p.stock, previousQuantity: 0, newQuantity: p.stock, type: "ADJUSTMENT", reason: "Initial stock (seed)", businessId: business.id, storeId: stores[0].id, userId: owner.id, createdAt: daysAgo(opts.salesDays + 1) } })
    store1Products.push(prod)
    if (stores[1] && i % 2 === 0) {
      const q = Math.floor(p.stock / 2)
      const prod2 = await prisma.product.create({ data: { name: p.name, sku: p.sku, barcode: p.barcode, purchasePrice: p.buy, costPrice: p.buy, sellingPrice: p.sell, taxRate: 0.2, stockQuantity: q, minimumStock: p.min, unit: p.unit ?? "pièce", businessId: business.id, storeId: stores[1].id, categoryId: cats.get(p.cat)!, brandId: p.brand ? brands.get(p.brand) : null, supplierId: suppliers[i % suppliers.length]?.id } })
      await prisma.inventoryMovement.create({ data: { productId: prod2.id, quantity: q, previousQuantity: 0, newQuantity: q, type: "ADJUSTMENT", reason: "Initial stock (seed)", businessId: business.id, storeId: stores[1].id, userId: owner.id, createdAt: daysAgo(opts.salesDays + 1) } })
    }
  }

  // Historical sales over N days in store 1 (closed registers per day), plus today's open register
  let saleSeq = 0
  const cashier = users.find((u) => u.email.startsWith("cashier")) ?? owner
  const initialStock = new Map(store1Products.map((p) => [p.id, p.stockQuantity]))
  for (let d = opts.salesDays; d >= 0; d--) await prisma.$transaction(async (prisma) => {
    // Weekly replenishment: restock products below minimum back to their initial level (PURCHASE movements)
    if (d % 7 === 0 && d > 0) {
      for (const p of store1Products) {
        const target = initialStock.get(p.id)!
        if (p.stockQuantity < target * 0.5) {
          const qty = target - p.stockQuantity
          await prisma.inventoryMovement.create({ data: { productId: p.id, quantity: qty, previousQuantity: p.stockQuantity, newQuantity: target, type: "PURCHASE", reason: "Réapprovisionnement hebdomadaire (seed)", businessId: business.id, storeId: stores[0].id, userId: owner.id, createdAt: daysAgo(d, 7) } })
          p.stockQuantity = target
        }
      }
    }
    const opened = daysAgo(d, 8)
    const reg = await prisma.cashRegister.create({ data: { name: "Caisse 1", openingBalance: 500, status: d === 0 ? "OPEN" : "CLOSED", openedAt: opened, openedBy: cashier.id, businessId: business.id, storeId: stores[0].id } })
    let cash = 0
    const n = d === 0 ? rand(3, 6) : rand(8, 18)
    for (let k = 0; k < n; k++) {
      const available = store1Products.map((p, i) => [p, i] as const).filter(([p]) => p.stockQuantity > 0)
      if (!available.length) break
      const lines = rand(1, Math.min(4, available.length))
      const chosen = new Set<number>()
      while (chosen.size < lines) chosen.add(available[rand(0, available.length - 1)][1])
      const items = [...chosen].map((idx) => { const p = store1Products[idx]; const qty = Math.min(rand(1, 3), p.stockQuantity); const total = r2(qty * p.sellingPrice); const subtotal = r2(total / 1.2); const cost = r2(qty * p.purchasePrice); return { p, qty, total, subtotal, tax: r2(total - subtotal), profit: r2(subtotal - cost) } })
      const total = r2(items.reduce((a, i) => a + i.total, 0))
      const subtotal = r2(items.reduce((a, i) => a + i.subtotal, 0))
      const method = Math.random() < 0.7 ? "CASH" : Math.random() < 0.8 ? "CARD" : "BANK_TRANSFER"
      const createdAt = daysAgo(d, rand(9, 21))
      saleSeq++
      const dp = `${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, "0")}${String(createdAt.getDate()).padStart(2, "0")}`
      const sale = await prisma.sale.create({ data: { saleNumber: `S-${dp}-${String(k + 1).padStart(4, "0")}`, idempotencyKey: `seed-${business.id}-${saleSeq}`, subtotal, taxAmount: r2(total - subtotal), total, profit: r2(items.reduce((a, i) => a + i.profit, 0)), status: "COMPLETED", paymentStatus: "PAID", createdAt, updatedAt: createdAt, businessId: business.id, storeId: stores[0].id, customerId: Math.random() < 0.4 ? customers[rand(0, customers.length - 1)].id : null, userId: cashier.id, cashRegisterId: reg.id, items: { create: items.map((i) => ({ productId: i.p.id, quantity: i.qty, unitPrice: i.p.sellingPrice, taxRate: 0.2, discount: 0, subtotal: i.subtotal, taxAmount: i.tax, total: i.total, profit: i.profit })) }, payments: { create: [{ amount: total, method, status: "PAID", businessId: business.id, storeId: stores[0].id, userId: cashier.id, createdAt }] } } })
      for (const i of items) {
        const prev = i.p.stockQuantity
        i.p.stockQuantity = Math.max(0, prev - i.qty)
        await prisma.inventoryMovement.create({ data: { productId: i.p.id, quantity: -i.qty, previousQuantity: prev, newQuantity: i.p.stockQuantity, type: "SALE", reason: `Sale ${sale.saleNumber}`, referenceId: sale.id, referenceType: "Sale", businessId: business.id, storeId: stores[0].id, userId: cashier.id, createdAt } })
      }
      if (method === "CASH") { cash += total; await prisma.cashRegisterTransaction.create({ data: { type: "SALE", amount: total, reason: `Sale ${sale.saleNumber}`, cashRegisterId: reg.id, businessId: business.id, storeId: stores[0].id, userId: cashier.id, createdAt } }) }
    }
    if (d > 0) {
      const expected = r2(500 + cash)
      const diff = Math.random() < 0.15 ? -rand(5, 50) : 0
      await prisma.cashRegister.update({ where: { id: reg.id }, data: { closedAt: daysAgo(d, 22), closedBy: cashier.id, expectedBalance: expected, actualBalance: r2(expected + diff), closingBalance: r2(expected + diff), difference: diff, differenceReason: diff ? "Erreur de rendu monnaie" : null } })
    }
  })
  // Persist final stock quantities
  for (const p of store1Products) await prisma.product.update({ where: { id: p.id }, data: { stockQuantity: p.stockQuantity } })

  // Expenses (monthly fixed + some variable)
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(9, 0, 0, 0)
  const exp = [["RENT", 4500, "Loyer du mois"], ["ELECTRICITY", 850, "Facture ONEE"], ["INTERNET", 399, "Fibre Maroc Telecom"], ["SALARIES", 6400, "Salaires équipe"], ["TRANSPORT", 300, "Livraison marchandises"], ["SUPPLIES", 220, "Sacs et rouleaux tickets"]] as const
  for (const [code, amount, desc] of exp) await prisma.expense.create({ data: { amount, categoryId: expCats.get(code)!, description: desc, date: monthStart, paymentMethod: code === "SALARIES" || code === "RENT" ? "BANK_TRANSFER" : "CASH", businessId: business.id, storeId: stores[0].id, userId: owner.id } })
  const lm = new Date(monthStart); lm.setMonth(lm.getMonth() - 1)
  for (const [code, amount, desc] of exp) await prisma.expense.create({ data: { amount: r2(amount * (0.9 + Math.random() * 0.2)), categoryId: expCats.get(code)!, description: desc, date: lm, paymentMethod: "BANK_TRANSFER", businessId: business.id, storeId: stores[0].id, userId: owner.id } })

  // Purchase orders: one received, one ordered
  if (suppliers[0]) {
    const items = store1Products.slice(0, 3).map((p) => ({ p, qty: 24, price: p.purchasePrice }))
    const sub = r2(items.reduce((a, i) => a + i.qty * i.price, 0))
    await prisma.purchaseOrder.create({ data: { orderNumber: `PO-${daysAgo(10).toISOString().slice(0, 10).replace(/-/g, "")}-0001`, supplierId: suppliers[0].id, subtotal: sub, taxAmount: r2(sub * 0.2), total: r2(sub * 1.2), status: "RECEIVED", createdAt: daysAgo(10), deliveredAt: daysAgo(7), expectedDelivery: daysAgo(6), businessId: business.id, storeId: stores[0].id, userId: owner.id, items: { create: items.map((i) => ({ productId: i.p.id, quantity: i.qty, receivedQuantity: i.qty, unitPrice: i.price, taxRate: 0.2, subtotal: r2(i.qty * i.price), taxAmount: r2(i.qty * i.price * 0.2), total: r2(i.qty * i.price * 1.2) })) } } })
    const items2 = store1Products.slice(3, 6).map((p) => ({ p, qty: 36, price: p.purchasePrice }))
    const sub2 = r2(items2.reduce((a, i) => a + i.qty * i.price, 0))
    await prisma.purchaseOrder.create({ data: { orderNumber: `PO-${daysAgo(1).toISOString().slice(0, 10).replace(/-/g, "")}-0001`, supplierId: suppliers[1 % suppliers.length].id, subtotal: sub2, taxAmount: r2(sub2 * 0.2), total: r2(sub2 * 1.2), status: "ORDERED", createdAt: daysAgo(1), expectedDelivery: daysAgo(-3), businessId: business.id, storeId: stores[0].id, userId: owner.id, items: { create: items2.map((i) => ({ productId: i.p.id, quantity: i.qty, unitPrice: i.price, taxRate: 0.2, subtotal: r2(i.qty * i.price), taxAmount: r2(i.qty * i.price * 0.2), total: r2(i.qty * i.price * 1.2) })) } } })
  }
  return { business, stores, users }
}

async function main() {
  console.log("Seeding development data…")
  await reset()
  for (const name of ROLES) await prisma.role.create({ data: { name, description: `System role: ${name}` } })

  await seedBusiness({
    name: "Demo Mini Market",
    type: "MINI_MARKET",
    city: "Casablanca",
    ownerEmail: "owner@demo.ma",
    stores: ["Maarif", "Ain Sebaa"],
    extraUsers: [
      { email: "cashier@demo.ma", role: "CASHIER", first: "Youssef", last: "Alami", storeIdx: [0] },
      { email: "manager@demo.ma", role: "MANAGER", first: "Salma", last: "Bennani", storeIdx: [0, 1] },
    ],
    suppliers: ["Coca-Cola Maroc", "Centrale Danone", "Bimo", "Lesieur Cristal"],
    customers: [{ name: "Ahmed Benali", phone: "+212661000001" }, { name: "Fatima Zahra", phone: "+212661000002" }, { name: "Karim El Idrissi", phone: "+212661000003" }, { name: "Nadia Tazi", phone: "+212661000004" }],
    products: [
      { name: "Coca-Cola 33cl", sku: "CC-33", barcode: "5449000000996", cat: "Boissons", brand: "Coca-Cola", buy: 4, sell: 6, stock: 120, min: 30 },
      { name: "Sidi Ali 1.5L", sku: "SA-150", barcode: "6111035000015", cat: "Boissons", brand: "Sidi Ali", buy: 4.5, sell: 6.5, stock: 90, min: 24 },
      { name: "Lait Centrale 1L", sku: "LC-1L", barcode: "6111242000012", cat: "Produits laitiers", brand: "Centrale", buy: 7, sell: 9, stock: 60, min: 20 },
      { name: "Yaourt Danone Nature", sku: "YD-N", barcode: "6111242100016", cat: "Produits laitiers", brand: "Danone", buy: 2.2, sell: 3.5, stock: 80, min: 20 },
      { name: "Pain complet", sku: "PN-C", barcode: "2000000000017", cat: "Boulangerie", buy: 1.5, sell: 2.5, stock: 40, min: 15 },
      { name: "Bimo Tango", sku: "BM-TG", barcode: "6111035500010", cat: "Snacks", brand: "Bimo", buy: 1.2, sell: 2, stock: 150, min: 40 },
      { name: "Chips Lays 45g", sku: "LY-45", barcode: "6111035500027", cat: "Snacks", brand: "Lays", buy: 3, sell: 5, stock: 70, min: 20 },
      { name: "Huile Lesieur 1L", sku: "HL-1L", barcode: "6111035600011", cat: "Épicerie", brand: "Lesieur", buy: 15, sell: 19, stock: 35, min: 10 },
      { name: "Sucre Cosumar 1kg", sku: "SC-1KG", barcode: "6111035600028", cat: "Épicerie", buy: 9, sell: 11, stock: 50, min: 15, unit: "kg" },
      { name: "Thé Sultan 200g", sku: "TS-200", barcode: "6111035600035", cat: "Épicerie", brand: "Sultan", buy: 18, sell: 24, stock: 30, min: 10 },
      { name: "Tide 1kg", sku: "TD-1KG", barcode: "6111035700018", cat: "Entretien", brand: "Tide", buy: 22, sell: 29, stock: 25, min: 8 },
      { name: "Javel Lacroix 1L", sku: "JL-1L", barcode: "6111035700025", cat: "Entretien", buy: 6, sell: 9, stock: 12, min: 15 },
      { name: "Shampoing Head&Shoulders", sku: "HS-400", barcode: "6111035800015", cat: "Hygiène", buy: 28, sell: 39, stock: 6, min: 8 },
      { name: "Savon Dove", sku: "DV-100", barcode: "6111035800022", cat: "Hygiène", brand: "Dove", buy: 7, sell: 10, stock: 0, min: 10 },
    ],
    salesDays: 45,
  })

  await seedBusiness({
    name: "Boutique Zahra",
    type: "CLOTHING",
    city: "Marrakech",
    ownerEmail: "owner@boutique.ma",
    stores: ["Guéliz"],
    suppliers: ["Textile Import SARL"],
    customers: [{ name: "Leila Amrani", phone: "+212662000001" }],
    products: [
      { name: "Robe été", sku: "RB-01", barcode: "3000000000011", cat: "Femme", buy: 120, sell: 249, stock: 15, min: 5 },
      { name: "Chemise homme", sku: "CH-01", barcode: "3000000000028", cat: "Homme", buy: 90, sell: 189, stock: 20, min: 5 },
      { name: "Sac à main", sku: "SM-01", barcode: "3000000000035", cat: "Accessoires", buy: 60, sell: 149, stock: 8, min: 3 },
    ],
    salesDays: 20,
  })

  console.log("Seed complete.")
  console.log("  owner@demo.ma / Demo12345   (OWNER, Demo Mini Market)")
  console.log("  manager@demo.ma / Demo12345 (MANAGER)")
  console.log("  cashier@demo.ma / Demo12345 (CASHIER)")
  console.log("  owner@boutique.ma / Demo12345 (OWNER, separate business)")
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
