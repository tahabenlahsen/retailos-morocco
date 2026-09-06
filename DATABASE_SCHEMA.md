# RetailOS Morocco - Database Schema Design

## Database Overview

**Database**: PostgreSQL
**ORM**: Prisma
**Naming Convention**: camelCase for fields, PascalCase for models
**Primary Keys**: UUID for all tables
**Soft Deletes**: Deleted records marked with `deletedAt` timestamp
**Timestamps**: `createdAt`, `updatedAt` on all tables
**Tenant Isolation**: All tenant-specific tables include `businessId` and `storeId`

## Core Models

### User
```prisma
model User {
  id                String    @id @default(uuid())
  email             String    @unique
  passwordHash      String
  firstName         String
  lastName          String
  phone             String?
  avatar            String?
  emailVerified     DateTime?
  status            UserStatus @default(ACTIVE)
  lastLoginAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  role              Role      @relation("UserRole")
  roleId            String
  stores            UserStore[]

  // Audit
  createdBy         String?
  updatedBy         String?

  @@index([email])
  @@index([businessId])
  @@index([status])
  @@map("users")
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  PENDING_VERIFICATION
}
```

### Business
```prisma
model Business {
  id                String    @id @default(uuid())
  name              String
  type              BusinessType
  ownerName         String
  phone             String
  email             String
  city              String
  address           String?
  currency          String    @default("MAD")
  taxRate           Float     @default(0.2)
  logo              String?
  status            BusinessStatus @default(ACTIVE)
  subscriptionPlan  SubscriptionPlan @default(FREE)
  subscriptionEndsAt DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  users             User[]
  stores            Store[]
  categories        Category[]
  brands            Brand[]
  suppliers         Supplier[]
  customers         Customer[]
  products          Product[]
  expenses          Expense[]
  auditLogs         AuditLog[]
  notifications     Notification[]

  @@index([status])
  @@index([subscriptionPlan])
  @@map("businesses")
}

enum BusinessType {
  MINI_MARKET
  GROCERY
  CLOTHING
  ELECTRONICS
  COSMETICS
  RESTAURANT
  PHARMACY
  OTHER
}

enum BusinessStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  TRIAL
}

enum SubscriptionPlan {
  FREE
  BASIC
  PROFESSIONAL
  ENTERPRISE
}
```

### Store
```prisma
model Store {
  id                String    @id @default(uuid())
  name              String
  phone             String?
  email             String?
  address           String?
  city              String
  size              Float?    // in square meters
  openTime          String?
  closeTime         String?
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  users             UserStore[]
  products          Product[]
  sales             Sale[]
  cashRegisters     CashRegister[]
  expenses          Expense[]
  purchaseOrders    PurchaseOrder[]
  inventoryMovements InventoryMovement[]

  @@index([businessId])
  @@index([isActive])
  @@map("stores")
}
```

### Role
```prisma
model Role {
  id                String    @id @default(uuid())
  name              String    @unique
  description       String?
  permissions       Permission[]
  users             User[]    @relation("UserRole")
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([name])
  @@map("roles")
}
```

### Permission
```prisma
model Permission {
  id                String    @id @default(uuid())
  name              String    @unique
  resource          String
  action            String
  description       String?
  roles             Role[]

  @@unique([resource, action])
  @@map("permissions")
}
```

### UserStore
```prisma
model UserStore {
  id                String    @id @default(uuid())
  userId            String
  storeId           String
  isDefault         Boolean   @default(false)
  createdAt         DateTime  @default(now())

  user              User      @relation(fields: [userId], references: [id])
  store             Store     @relation(fields: [storeId], references: [id])

  @@unique([userId, storeId])
  @@index([userId])
  @@index([storeId])
  @@map("user_stores")
}
```

## Product & Inventory Models

### Category
```prisma
model Category {
  id                String    @id @default(uuid())
  name              String
  description       String?
  parentId          String?
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  parent            Category? @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children          Category[] @relation("CategoryHierarchy")
  products          Product[]

  @@index([businessId])
  @@index([parentId])
  @@map("categories")
}
```

### Brand
```prisma
model Brand {
  id                String    @id @default(uuid())
  name              String
  description       String?
  logo              String?
  website           String?
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  products          Product[]

  @@index([businessId])
  @@map("brands")
}
```

### Product
```prisma
model Product {
  id                String    @id @default(uuid())
  name              String
  sku               String    @unique
  barcode           String?   @unique
  description       String?
  image             String?
  purchasePrice     Float
  sellingPrice      Float
  taxRate           Float     @default(0.2)
  stockQuantity     Int       @default(0)
  minimumStock      Int       @default(0)
  maximumStock      Int?
  unit              String    @default("piece")
  isActive          Boolean   @default(true)
  costPrice         Float?    // Average cost for COGS calculation
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  categoryId        String
  category          Category  @relation(fields: [categoryId], references: [id])
  brandId           String?
  brand             Brand?    @relation(fields: [brandId], references: [id])
  supplierId        String?
  supplier          Supplier? @relation(fields: [supplierId], references: [id])

  // Transaction relations
  saleItems         SaleItem[]
  purchaseOrderItems PurchaseOrderItem[]
  inventoryMovements InventoryMovement[]

  @@index([businessId])
  @@index([storeId])
  @@index([categoryId])
  @@index([barcode])
  @@index([sku])
  @@index([isActive])
  @@map("products")
}
```

### InventoryMovement
```prisma
model InventoryMovement {
  id                String    @id @default(uuid())
  product           Product   @relation(fields: [productId], references: [id])
  productId         String
  quantity          Int
  previousQuantity  Int
  newQuantity       Int
  type              MovementType
  reason            String?
  referenceId       String?   // ID of related document (sale, purchase, etc.)
  referenceType     String?   // Type of related document
  createdAt         DateTime  @default(now())

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  userId            String?

  @@index([businessId])
  @@index([storeId])
  @@index([productId])
  @@index([type])
  @@index([createdAt])
  @@map("inventory_movements")
}

enum MovementType {
  SALE
  PURCHASE
  RETURN
  ADJUSTMENT
  TRANSFER
  DAMAGE
  LOSS
}
```

## Sales & Payment Models

### Sale
```prasma
model Sale {
  id                String    @id @default(uuid())
  saleNumber        String    @unique
  subtotal          Float
  taxAmount         Float
  discountAmount    Float     @default(0)
  total             Float
  profit            Float?
  status            SaleStatus @default(COMPLETED)
  paymentStatus     PaymentStatus @default(PAID)
  notes             String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  customerId        String?
  customer          Customer? @relation(fields: [customerId], references: [id])
  userId            String
  cashRegisterId    String?
  cashRegister      CashRegister? @relation(fields: [cashRegisterId], references: [id])

  // Transaction relations
  items             SaleItem[]
  payments          Payment[]
  refunds           Refund[]

  @@index([businessId])
  @@index([storeId])
  @@index([customerId])
  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([saleNumber])
  @@map("sales")
}

enum SaleStatus {
  DRAFT
  COMPLETED
  CANCELLED
  REFUNDED
}

enum PaymentStatus {
  PENDING
  PARTIALLY_PAID
  PAID
  REFUNDED
}
```

### SaleItem
```prisma
model SaleItem {
  id                String    @id @default(uuid())
  product           Product   @relation(fields: [productId], references: [id])
  productId         String
  quantity          Int
  unitPrice         Float
  taxRate           Float
  discount         Float     @default(0)
  subtotal          Float
  taxAmount         Float
  total             Float
  profit            Float?
  createdAt         DateTime  @default(now())

  // Relations
  saleId            String
  sale              Sale      @relation(fields: [saleId], references: [id])

  @@index([saleId])
  @@index([productId])
  @@map("sale_items")
}
```

### Payment
```prisma
model Payment {
  id                String    @id @default(uuid())
  amount            Float
  method            PaymentMethod
  reference         String?   // Transaction reference, card number, etc.
  status            PaymentStatus @default(PAID)
  notes             String?
  createdAt         DateTime  @default(now())

  // Relations
  saleId            String
  sale              Sale      @relation(fields: [saleId], references: [id])
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  userId            String

  @@index([saleId])
  @@index([businessId])
  @@index([storeId])
  @@index([method])
  @@index([createdAt])
  @@map("payments")
}

enum PaymentMethod {
  CASH
  CARD
  BANK_TRANSFER
  CHECK
  OTHER
}
```

### Refund
```prisma
model Refund {
  id                String    @id @default(uuid())
  amount            Float
  reason            String?
  status            RefundStatus @default(PENDING)
  refundedAt        DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // Relations
  saleId            String
  sale              Sale      @relation(fields: [saleId], references: [id])
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  userId            String

  @@index([saleId])
  @@index([businessId])
  @@index([storeId])
  @@index([status])
  @@map("refunds")
}

enum RefundStatus {
  PENDING
  APPROVED
  REJECTED
  COMPLETED
}
```

### CashRegister
```prisma
model CashRegister {
  id                String    @id @default(uuid())
  name              String
  openingBalance    Float
  closingBalance    Float?
  expectedBalance   Float?
  actualBalance     Float?
  difference        Float?
  differenceReason  String?
  status            RegisterStatus @default(OPEN)
  openedAt          DateTime  @default(now())
  closedAt          DateTime?
  openedBy          String
  closedBy          String?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  sales             Sale[]
  transactions      CashRegisterTransaction[]

  @@index([businessId])
  @@index([storeId])
  @@index([status])
  @@index([openedAt])
  @@map("cash_registers")
}

enum RegisterStatus {
  OPEN
  CLOSED
}
```

### CashRegisterTransaction
```prisma
model CashRegisterTransaction {
  id                String    @id @default(uuid())
  type              TransactionType
  amount            Float
  reason            String?
  createdAt         DateTime  @default(now())

  // Relations
  cashRegisterId    String
  cashRegister      CashRegister @relation(fields: [cashRegisterId], references: [id])
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  userId            String

  @@index([cashRegisterId])
  @@index([businessId])
  @@index([storeId])
  @@index([type])
  @@index([createdAt])
  @@map("cash_register_transactions")
}

enum TransactionType {
  SALE
  REFUND
  WITHDRAWAL
  DEPOSIT
  ADJUSTMENT
}
```

## Purchase & Supplier Models

### Supplier
```prisma
model Supplier {
  id                String    @id @default(uuid())
  name              String
  phone             String?
  email             String?
  address           String?
  taxNumber         String?
  creditLimit       Float?
  currentBalance    Float     @default(0)
  isActive          Boolean   @default(true)
  notes             String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  products          Product[]
  purchaseOrders    PurchaseOrder[]

  @@index([businessId])
  @@index([isActive])
  @@map("suppliers")
}
```

### PurchaseOrder
```prisma
model PurchaseOrder {
  id                String    @id @default(uuid())
  orderNumber       String    @unique
  supplier          Supplier  @relation(fields: [supplierId], references: [id])
  supplierId        String
  subtotal          Float
  taxAmount         Float
  total             Float
  status            PurchaseStatus @default(DRAFT)
  expectedDelivery  DateTime?
  deliveredAt       DateTime?
  notes             String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  userId            String
  items             PurchaseOrderItem[]

  @@index([businessId])
  @@index([storeId])
  @@index([supplierId])
  @@index([status])
  @@index([createdAt])
  @@map("purchase_orders")
}

enum PurchaseStatus {
  DRAFT
  ORDERED
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
}
```

### PurchaseOrderItem
```prisma
model PurchaseOrderItem {
  id                String    @id @default(uuid())
  product           Product   @relation(fields: [productId], references: [id])
  productId         String
  quantity          Int
  receivedQuantity  Int       @default(0)
  unitPrice         Float
  taxRate           Float
  subtotal          Float
  taxAmount         Float
  total             Float
  createdAt         DateTime  @default(now())

  // Relations
  purchaseOrderId   String
  purchaseOrder     PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])

  @@index([purchaseOrderId])
  @@index([productId])
  @@map("purchase_order_items")
}
```

## Customer & Expense Models

### Customer
```prisma
model Customer {
  id                String    @id @default(uuid())
  name              String
  phone             String?
  email             String?
  address           String?
  loyaltyPoints     Int       @default(0)
  totalSpending     Float     @default(0)
  outstandingBalance Float     @default(0)
  notes             String?
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  sales             Sale[]

  @@index([businessId])
  @@index([phone])
  @@index([isActive])
  @@map("customers")
}
```

### Expense
```prisma
model Expense {
  id                String    @id @default(uuid())
  amount            Float
  category          ExpenseCategory @relation(fields: [categoryId], references: [id])
  categoryId        String
  description       String?
  date              DateTime  @default(now())
  paymentMethod     PaymentMethod
  receipt           String?
  notes             String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  storeId           String
  store             Store     @relation(fields: [storeId], references: [id])
  userId            String

  @@index([businessId])
  @@index([storeId])
  @@index([categoryId])
  @@index([date])
  @@map("expenses")
}
```

### ExpenseCategory
```prisma
model ExpenseCategory {
  id                String    @id @default(uuid())
  name              String
  description       String?
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  expenses          Expense[]

  @@index([businessId])
  @@map("expense_categories")
}
```

## System Models

### Notification
```prisma
model Notification {
  id                String    @id @default(uuid())
  type              NotificationType
  title             String
  message           String
  data              Json?     // Additional data
  isRead            Boolean   @default(false)
  readAt            DateTime?
  createdAt         DateTime  @default(now())

  // Relations
  businessId        String
  business          Business  @relation(fields: [businessId], references: [id])
  userId            String

  @@index([businessId])
  @@index([userId])
  @@index([isRead])
  @@index([createdAt])
  @@map("notifications")
}

enum NotificationType {
  LOW_STOCK
  OUT_OF_STOCK
  LARGE_EXPENSE
  SALES_DECREASE
  REGISTER_DISCREPANCY
  PURCHASE_RECEIVED
  SYSTEM
  OTHER
}
```

### AuditLog
```prisma
model AuditLog {
  id                String    @id @default(uuid())
  action            String
  entityType        String
  entityId          String
  userId            String
  businessId        String
  metadata          Json?
  ipAddress         String?
  userAgent         String?
  createdAt         DateTime  @default(now())

  // Relations
  business          Business  @relation(fields: [businessId], references: [id])

  @@index([businessId])
  @@index([userId])
  @@index([entityType])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}
```

## Database Indexes Strategy

### Performance Indexes
- Foreign key fields
- Frequently queried fields (status, dates)
- Composite indexes for common query patterns
- Unique constraints for business keys

### Security Indexes
- Tenant isolation fields (businessId, storeId)
- User authorization fields
- Audit trail fields

## Data Integrity

### Constraints
- Unique constraints on business keys (SKU, barcode, email)
- Foreign key constraints for relationships
- Check constraints for business rules (positive quantities, etc.)

### Transactions
- All financial operations use database transactions
- Inventory updates are atomic
- Sales processing is transactional

## Migration Strategy

### Version Control
- All schema changes through Prisma migrations
- Migration files committed to version control
- Rollback capability for all migrations

### Data Seeding
- Development seed data
- Production seed data (system configs, default roles)
- Idempotent seed scripts

## Security Considerations

### Row-Level Security
- All queries scoped by businessId/storeId
- Middleware enforces tenant isolation
- Application-level validation

### Sensitive Data
- Password hashes (never exposed)
- API keys (environment variables)
- Financial data (encrypted at rest - future)

### Audit Trail
- All sensitive actions logged
- Immutable audit records
- User attribution for all changes
