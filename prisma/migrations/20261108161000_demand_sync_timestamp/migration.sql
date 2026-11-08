-- Prisma SQLite dates are millisecond integers. SQL CURRENT_TIMESTAMP strings
-- do not compare correctly with the worker's Date cutoff.
UPDATE "DemandSheetSync"
SET "nextAttemptAt" = CAST(strftime('%s', "nextAttemptAt") AS INTEGER) * 1000
WHERE typeof("nextAttemptAt") = 'text';
