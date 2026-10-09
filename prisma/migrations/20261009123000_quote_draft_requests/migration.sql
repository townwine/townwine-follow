CREATE TABLE "QuoteDraftRequest" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "shop" TEXT NOT NULL,
 "customerId" TEXT NOT NULL,
 "payloadHash" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "productId" TEXT,
 "handle" TEXT NOT NULL,
 "quoteJson" TEXT NOT NULL,
 "error" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "QuoteDraftRequest_shop_customerId_createdAt_idx" ON "QuoteDraftRequest"("shop", "customerId", "createdAt");
