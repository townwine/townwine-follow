-- CreateTable
CREATE TABLE "UpcomingDealAlertSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UpcomingDealAlertSubscription_shop_customerId_productId_key" ON "UpcomingDealAlertSubscription"("shop", "customerId", "productId");

-- CreateIndex
CREATE INDEX "UpcomingDealAlertSubscription_shop_productId_idx" ON "UpcomingDealAlertSubscription"("shop", "productId");
