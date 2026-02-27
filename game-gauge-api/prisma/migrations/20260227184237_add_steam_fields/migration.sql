/*
  Warnings:

  - A unique constraint covering the columns `[steamId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "steamAvatar" TEXT,
ADD COLUMN     "steamId" TEXT,
ADD COLUMN     "steamProfileUrl" TEXT,
ADD COLUMN     "steamUsername" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_steamId_key" ON "User"("steamId");

-- CreateIndex
CREATE INDEX "User_steamId_idx" ON "User"("steamId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "Rating"("id") ON DELETE SET NULL ON UPDATE CASCADE;
