-- CreateTable
CREATE TABLE "CollectorComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "collectorHandle" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerDisplayName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CollectorComment_shop_collectorHandle_createdAt_idx" ON "CollectorComment"("shop", "collectorHandle", "createdAt");

-- CreateIndex
CREATE INDEX "CollectorComment_shop_customerId_idx" ON "CollectorComment"("shop", "customerId");
