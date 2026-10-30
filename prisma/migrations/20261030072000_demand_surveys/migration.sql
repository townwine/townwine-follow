CREATE TABLE "DemandSurvey" (
"id" TEXT NOT NULL PRIMARY KEY, "shop" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
"ownerName" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
"imageUrl" TEXT NOT NULL, "imageData" BLOB, "imageMime" TEXT, "sourceUrl" TEXT NOT NULL, "expectedPrice" INTEGER,
"targetQuantity" INTEGER, "closesAt" DATETIME NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN',
"productId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
CREATE INDEX "DemandSurvey_shop_createdAt_idx" ON "DemandSurvey"("shop", "createdAt");
CREATE INDEX "DemandSurvey_shop_ownerId_idx" ON "DemandSurvey"("shop", "ownerId");
CREATE TABLE "DemandEntry" (
"id" TEXT NOT NULL PRIMARY KEY, "surveyId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
"displayName" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
CONSTRAINT "DemandEntry_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "DemandSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "DemandEntry_surveyId_customerId_key" ON "DemandEntry"("surveyId", "customerId");
