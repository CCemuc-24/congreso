-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'ABORTED', 'TIMEOUT', 'ERROR');

-- AlterTable
ALTER TABLE "Purchase"
  ADD COLUMN "amount" INTEGER,
  ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "token" TEXT,
  ADD COLUMN "authorizationCode" TEXT,
  ADD COLUMN "paymentTypeCode" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3);

-- Backfill: rows already settled under the old boolean become PAID. updatedAt is
-- the closest available proxy for when they were paid.
UPDATE "Purchase" SET "status" = 'PAID', "paidAt" = "updatedAt" WHERE "isPaid" = true;

-- CreateIndex: buyOrder is the join key from the Transbank callback. Postgres
-- permits multiple NULLs in a unique index, so legacy rows without a buyOrder
-- are unaffected.
CREATE UNIQUE INDEX "Purchase_buyOrder_key" ON "Purchase"("buyOrder");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");
