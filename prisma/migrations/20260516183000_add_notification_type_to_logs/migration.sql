PRAGMA foreign_keys=OFF;

CREATE TABLE "new_NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "influencerHandle" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL DEFAULT 'FOLLOW_NEW_DEAL',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_NotificationLog" (
    "id",
    "shop",
    "customerId",
    "influencerHandle",
    "productId",
    "notificationType",
    "sentAt"
)
SELECT
    "id",
    "shop",
    "customerId",
    "influencerHandle",
    "productId",
    'FOLLOW_NEW_DEAL',
    "sentAt"
FROM "NotificationLog";

DROP TABLE "NotificationLog";
ALTER TABLE "new_NotificationLog" RENAME TO "NotificationLog";

CREATE UNIQUE INDEX "NotificationLog_shop_customerId_productId_notificationType_key"
ON "NotificationLog"("shop", "customerId", "productId", "notificationType");

CREATE INDEX "NotificationLog_shop_influencerHandle_idx"
ON "NotificationLog"("shop", "influencerHandle");

PRAGMA foreign_keys=ON;
