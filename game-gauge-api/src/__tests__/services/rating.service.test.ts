import { RatingService } from '../../services/rating.service';
import { NotFoundError } from '../../utils/errors.util';
import { testUser, testGame, testRating } from '../setup';
import { prisma } from '../../config/database';

describe('RatingService', () => {
  let ratingService: RatingService;

  beforeEach(() => {
    ratingService = new RatingService();
  });

  describe('rateGame', () => {
    const ratingData = { score: 8 };

    it('should create or update a rating successfully', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
      (prisma.rating.upsert as jest.Mock).mockResolvedValue(testRating);
      // getStats uses findMany to fetch scores, then computes in memory
      (prisma.rating.findMany as jest.Mock).mockResolvedValue([{ score: 8 }]);

      // Act
      const result = await ratingService.rateGame(testUser.id, testGame.id, ratingData);

      // Assert
      expect(prisma.rating.upsert).toHaveBeenCalled();
      expect(result).toHaveProperty('rating');
      expect(result).toHaveProperty('stats');
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        ratingService.rateGame(testUser.id, 'invalid-game-id', ratingData)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUserRating', () => {
    it('should return user rating for game', async () => {
      // Arrange — findByUserAndGame uses findUnique (not findFirst)
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(testRating);

      // Act
      const result = await ratingService.getUserRating(testUser.id, testGame.id);

      // Assert
      expect(result).toEqual(testRating);
    });

    it('should throw NotFoundError if rating not found', async () => {
      // Arrange
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(ratingService.getUserRating(testUser.id, testGame.id)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('getGameRatings', () => {
    it('should return paginated ratings for game', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
      (prisma.rating.findMany as jest.Mock).mockResolvedValue([testRating]);
      (prisma.rating.count as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await ratingService.getGameRatings(testGame.id, { page: 1, limit: 10 });

      // Assert
      expect(result).toHaveProperty('data');
      expect(prisma.rating.findMany).toHaveBeenCalled();
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        ratingService.getGameRatings('invalid-game-id', { page: 1, limit: 10 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUserRatings', () => {
    it('should return paginated ratings by user', async () => {
      // Arrange
      (prisma.rating.findMany as jest.Mock).mockResolvedValue([testRating]);
      (prisma.rating.count as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await ratingService.getUserRatings(testUser.id, { page: 1, limit: 10 });

      // Assert
      expect(result).toHaveProperty('data');
      expect(prisma.rating.findMany).toHaveBeenCalled();
    });
  });

  describe('deleteRating', () => {
    it('should delete rating successfully', async () => {
      // Arrange — findByUserAndGame uses findUnique
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(testRating);
      (prisma.rating.delete as jest.Mock).mockResolvedValue(testRating);
      // getStats uses findMany for in-memory calculation
      (prisma.rating.findMany as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await ratingService.deleteRating(testUser.id, testGame.id);

      // Assert
      expect(prisma.rating.delete).toHaveBeenCalled();
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('stats');
    });

    it('should throw NotFoundError if rating does not exist', async () => {
      // Arrange
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(ratingService.deleteRating(testUser.id, testGame.id)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('getGameStats', () => {
    it('should return rating statistics', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
      // getStats uses findMany to fetch scores and computes distribution in memory
      (prisma.rating.findMany as jest.Mock).mockResolvedValue([
        { score: 10 },
        { score: 9 },
        { score: 9 },
        { score: 8 },
      ]);

      // Act
      const result = await ratingService.getGameStats(testGame.id);

      // Assert
      expect(result).toHaveProperty('averageScore');
      expect(result).toHaveProperty('totalRatings');
      expect(result).toHaveProperty('distribution');
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(ratingService.getGameStats('invalid-game-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('hasUserRated', () => {
    it('should return true if user has rated game', async () => {
      // Arrange — hasUserRated uses count, not findFirst
      (prisma.rating.count as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await ratingService.hasUserRated(testUser.id, testGame.id);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false if user has not rated game', async () => {
      // Arrange
      (prisma.rating.count as jest.Mock).mockResolvedValue(0);

      // Act
      const result = await ratingService.hasUserRated(testUser.id, testGame.id);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getRecentRatings', () => {
    it('should return recent ratings by user', async () => {
      // Arrange
      (prisma.rating.findMany as jest.Mock).mockResolvedValue([testRating]);

      // Act
      const result = await ratingService.getRecentRatings(testUser.id, 10);

      // Assert — getRecentByUser uses findMany with game+user selects, not include: { game: true }
      expect(prisma.rating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: testUser.id },
          take: 10,
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result).toEqual([testRating]);
    });
  });
});
