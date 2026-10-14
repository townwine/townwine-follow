ALTER TABLE "QuoteDraftRequest" ADD COLUMN "sheetPayload" TEXT;
ALTER TABLE "QuoteDraftRequest" ADD COLUMN "sheetStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "QuoteDraftRequest" ADD COLUMN "sheetError" TEXT;
ALTER TABLE "QuoteDraftRequest" ADD COLUMN "sheetSyncedAt" DATETIME;
