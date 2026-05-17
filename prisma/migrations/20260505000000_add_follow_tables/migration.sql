-- CreateTable
CREATE TABLE "FollowSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "influencerHandle" TEXT NOT NULL,
    "influencerName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "influencerHandle" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowSubscription_shop_customerId_influencerHandle_key" ON "FollowSubscription"("shop", "customerId", "influencerHandle");

-- CreateIndex
CREATE INDEX "FollowSubscription_shop_influencerHandle_idx" ON "FollowSubscription"("shop", "influencerHandle");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_shop_customerId_productId_key" ON "NotificationLog"("shop", "customerId", "productId");

-- CreateIndex
CREATE INDEX "NotificationLog_shop_influencerHandle_idx" ON "NotificationLog"("shop", "influencerHandle");
