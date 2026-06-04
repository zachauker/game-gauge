-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "ageRating" TEXT,
ADD COLUMN     "franchise" TEXT,
ADD COLUMN     "gameModes" TEXT[],
ADD COLUMN     "igdbRating" DOUBLE PRECISION,
ADD COLUMN     "igdbRatingCount" INTEGER,
ADD COLUMN     "perspectives" TEXT[],
ADD COLUMN     "storyline" TEXT,
ADD COLUMN     "themes" TEXT[],
ADD COLUMN     "websiteOfficial" TEXT,
ADD COLUMN     "websiteSteam" TEXT;
