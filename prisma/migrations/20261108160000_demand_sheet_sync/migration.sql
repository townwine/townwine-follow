CREATE TABLE "DemandSheetSync" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "surveyId" TEXT NOT NULL,
 "customerId" TEXT NOT NULL,
 "displayName" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 "syncedAt" DATETIME,
 "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DemandSheetSync_surveyId_customerId_key" ON "DemandSheetSync"("surveyId", "customerId");
CREATE INDEX "DemandSheetSync_syncedAt_nextAttemptAt_idx" ON "DemandSheetSync"("syncedAt", "nextAttemptAt");
INSERT INTO "DemandSheetSync" ("id","surveyId","customerId","displayName","createdAt","updatedAt") SELECT "id","surveyId","customerId","displayName","createdAt","updatedAt" FROM "DemandEntry";
