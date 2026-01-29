-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "Rating"("id") ON DELETE SET NULL ON UPDATE CASCADE;
