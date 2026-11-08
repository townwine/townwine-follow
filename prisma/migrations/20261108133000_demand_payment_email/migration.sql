CREATE TABLE "DemandPaymentEmail" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "shop" TEXT NOT NULL,
 "productId" TEXT NOT NULL,
 "customerId" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "payloadJson" TEXT,
 "leaseToken" TEXT,
 "leaseAt" DATETIME,
 "sentAt" DATETIME,
 "lastError" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "DemandPaymentEmail_shop_productId_customerId_key" ON "DemandPaymentEmail"("shop", "productId", "customerId");
CREATE INDEX "DemandPaymentEmail_shop_productId_status_idx" ON "DemandPaymentEmail"("shop", "productId", "status");

ALTER TABLE "DemandSurvey" ADD COLUMN "paymentAnnouncementsReleasedAt" DATETIME;
