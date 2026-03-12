-- AlterTable
ALTER TABLE "GameListItem" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completionType" TEXT,
ADD COLUMN     "progressNote" TEXT,
ADD COLUMN     "progressPct" INTEGER,
ADD COLUMN     "steamAchievements" JSONB;

-- CreateIndex
CREATE INDEX "GameListItem_completedAt_idx" ON "GameListItem"("completedAt");

-- CreateIndex
CREATE INDEX "GameListItem_completionType_idx" ON "GameListItem"("completionType");
