-- AlterTable
ALTER TABLE "GameList" ADD COLUMN     "sortBy" TEXT NOT NULL DEFAULT 'custom',
ADD COLUMN     "sortDir" TEXT NOT NULL DEFAULT 'asc';
