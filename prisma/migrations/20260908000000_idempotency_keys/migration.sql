-- Add idempotency keys to refunds and customer payments so that retried
-- requests return the original record instead of creating duplicates.

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "customer_payments" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotencyKey_key" ON "refunds"("idempotencyKey");
CREATE UNIQUE INDEX "customer_payments_idempotencyKey_key" ON "customer_payments"("idempotencyKey");
