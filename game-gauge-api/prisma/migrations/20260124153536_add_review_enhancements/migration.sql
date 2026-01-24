-- AlterTable
ALTER TABLE "Review" ADD COLUMN "ratingId" TEXT,
ADD COLUMN "spoilers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "helpfulCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Review_ratingId_key" ON "Review"("ratingId");

-- CreateIndex
CREATE INDEX "Review_helpfulCount_idx" ON "Review"("helpfulCount");

-- CreateTable
CREATE TABLE "ReviewHelpful" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewHelpful_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewHelpful_reviewId_idx" ON "ReviewHelpful"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewHelpful_userId_idx" ON "ReviewHelpful"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewHelpful_userId_reviewId_key" ON "ReviewHelpful"("userId", "reviewId");

-- AddForeignKey
ALTER TABLE "ReviewHelpful" ADD CONSTRAINT "ReviewHelpful_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewHelpful" ADD CONSTRAINT "ReviewHelpful_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
