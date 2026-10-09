CREATE TABLE "CollectorDealIndex" (
 "handle" TEXT NOT NULL PRIMARY KEY,
 "collectorHandle" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "searchTitle" TEXT NOT NULL,
 "vendor" TEXT NOT NULL,
 "image" TEXT NOT NULL,
 "available" BOOLEAN NOT NULL,
 "dealDate" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL,
 "generation" TEXT NOT NULL
);
CREATE INDEX "CollectorDealIndex_collectorHandle_dealDate_handle_idx" ON "CollectorDealIndex"("collectorHandle", "dealDate", "handle");
CREATE INDEX "CollectorDealIndex_collectorHandle_available_dealDate_idx" ON "CollectorDealIndex"("collectorHandle", "available", "dealDate");
CREATE TABLE "CollectorDealIndexState" ("id" TEXT NOT NULL PRIMARY KEY,"updatedAt" DATETIME NOT NULL);
