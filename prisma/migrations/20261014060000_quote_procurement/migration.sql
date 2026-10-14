ALTER TABLE "QuoteDraftRequest" ADD COLUMN "procurementRegistration" TEXT;
ALTER TABLE "QuoteDraftRequest" ADD COLUMN "procurementState" TEXT;
ALTER TABLE "QuoteDraftRequest" ADD COLUMN "procurementCheckedAt" DATETIME;
ALTER TABLE "QuoteDraftRequest" ADD COLUMN "procurementLeaseAt" DATETIME;
ALTER TABLE "QuoteDraftRequest" ADD COLUMN "procurementSentAt" DATETIME;
ALTER TABLE "QuoteDraftRequest" ADD COLUMN "procurementError" TEXT;
