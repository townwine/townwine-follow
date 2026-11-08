ALTER TABLE "DemandSurvey" ADD COLUMN "participantMailRequestedAt" DATETIME;
ALTER TABLE "DemandSurvey" ADD COLUMN "followerMailRequestedAt" DATETIME;
UPDATE "DemandSurvey" SET "participantMailRequestedAt" = "paymentAnnouncementsReleasedAt", "followerMailRequestedAt" = "paymentAnnouncementsReleasedAt" WHERE "paymentAnnouncementsReleasedAt" IS NOT NULL;
