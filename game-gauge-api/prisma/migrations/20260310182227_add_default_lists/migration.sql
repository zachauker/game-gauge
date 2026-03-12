-- AlterTable
ALTER TABLE "GameList" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "listType" TEXT NOT NULL DEFAULT 'custom';

-- CreateIndex
CREATE INDEX "GameList_listType_idx" ON "GameList"("listType");

-- CreateIndex
CREATE INDEX "GameList_userId_listType_idx" ON "GameList"("userId", "listType");
