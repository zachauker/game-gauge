import { reviewService } from '../../services/review.service';
import { reviewRepository } from '../../repositories/review.repository';
import { gameRepository } from '../../repositories/game.repository';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors.util';

// Mock the repositories
jest.mock('../../repositories/review.repository');
jest.mock('../../repositories/game.repository');

describe('ReviewService', () => {
  const mockUserId = 'user-123';
  const mockGameId = 'game-456';
  const mockReviewId = 'review-789';

  const mockGame = {
    id: mockGameId,
    title: 'Test Game',
    slug: 'test-game',
    description: 'A test game',
    releaseDate: new Date('2024-01-01'),
    developer: 'Test Dev',
    publisher: 'Test Pub',
    genres: ['Action'],
    platforms: ['PC'],
    coverImage: null,
    igdbId: null,
    metacritic: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReview = {
    id: mockReviewId,
    content: 'This is a test review with enough characters',
    userId: mockUserId,
    gameId: mockGameId,
    ratingId: null,
    spoilers: false,
    helpfulCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: mockUserId,
      username: 'testuser',
      avatar: null,
    },
    _count: {
      helpfulVotes: 0,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a review successfully', async () => {
      (gameRepository.findById as jest.Mock).mockResolvedValue(mockGame);
      (reviewRepository.findByUserAndGame as jest.Mock).mockResolvedValue(null);
      (reviewRepository.create as jest.Mock).mockResolvedValue(mockReview);
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);

      await reviewService.create(mockUserId, mockGameId, {
        content: 'This is a test review with enough characters',
        spoilers: false,
      });

      expect(gameRepository.findById).toHaveBeenCalledWith(mockGameId);
      expect(reviewRepository.findByUserAndGame).toHaveBeenCalledWith(mockUserId, mockGameId);
      expect(reviewRepository.create).toHaveBeenCalledWith({
        content: 'This is a test review with enough characters',
        userId: mockUserId,
        gameId: mockGameId,
        spoilers: false,
      });
    });

    it('should create review with spoilers flag', async () => {
      (gameRepository.findById as jest.Mock).mockResolvedValue(mockGame);
      (reviewRepository.findByUserAndGame as jest.Mock).mockResolvedValue(null);
      (reviewRepository.create as jest.Mock).mockResolvedValue({
        ...mockReview,
        spoilers: true,
      });
      (reviewRepository.findById as jest.Mock).mockResolvedValue({
        ...mockReview,
        spoilers: true,
      });

      await reviewService.create(mockUserId, mockGameId, {
        content: 'This review contains spoilers about the ending',
        spoilers: true,
      });

      expect(reviewRepository.create).toHaveBeenCalledWith({
        content: 'This review contains spoilers about the ending',
        userId: mockUserId,
        gameId: mockGameId,
        spoilers: true,
      });
    });

    it('should throw NotFoundError if game does not exist', async () => {
      (gameRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewService.create(mockUserId, mockGameId, {
          content: 'This is a test review',
          spoilers: false,
        })
      ).rejects.toThrow(NotFoundError);

      expect(gameRepository.findById).toHaveBeenCalledWith(mockGameId);
      expect(reviewRepository.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictError if user already reviewed the game', async () => {
      (gameRepository.findById as jest.Mock).mockResolvedValue(mockGame);
      (reviewRepository.findByUserAndGame as jest.Mock).mockResolvedValue(mockReview);

      await expect(
        reviewService.create(mockUserId, mockGameId, {
          content: 'Another review',
          spoilers: false,
        })
      ).rejects.toThrow(ConflictError);

      expect(reviewRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a review by id', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);

      const result = await reviewService.findById(mockReviewId);

      expect(reviewRepository.findById).toHaveBeenCalledWith(mockReviewId);
      expect(result).toEqual(mockReview);
    });

    it('should throw NotFoundError if review does not exist', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(reviewService.findById(mockReviewId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUserReview', () => {
    it('should return user\'s review for a game', async () => {
      (reviewRepository.findByUserAndGame as jest.Mock).mockResolvedValue(mockReview);

      const result = await reviewService.getUserReview(mockUserId, mockGameId);

      expect(reviewRepository.findByUserAndGame).toHaveBeenCalledWith(mockUserId, mockGameId);
      expect(result).toEqual(mockReview);
    });

    it('should throw NotFoundError if review does not exist', async () => {
      (reviewRepository.findByUserAndGame as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewService.getUserReview(mockUserId, mockGameId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getGameReviews', () => {
    it('should return paginated game reviews', async () => {
      const mockPaginatedReviews = {
        data: [mockReview],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      (gameRepository.findById as jest.Mock).mockResolvedValue(mockGame);
      (reviewRepository.findByGame as jest.Mock).mockResolvedValue(mockPaginatedReviews);

      const result = await reviewService.getGameReviews(mockGameId, {
        page: 1,
        limit: 10,
        sortBy: 'helpfulCount',
        sortOrder: 'desc',
      });

      expect(gameRepository.findById).toHaveBeenCalledWith(mockGameId);
      expect(reviewRepository.findByGame).toHaveBeenCalledWith(
        mockGameId,
        1,
        10,
        'helpfulCount',
        'desc'
      );
      expect(result).toEqual(mockPaginatedReviews);
    });

    it('should sort by createdAt when specified', async () => {
      const mockPaginatedReviews = {
        data: [mockReview],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (gameRepository.findById as jest.Mock).mockResolvedValue(mockGame);
      (reviewRepository.findByGame as jest.Mock).mockResolvedValue(mockPaginatedReviews);

      await reviewService.getGameReviews(mockGameId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(reviewRepository.findByGame).toHaveBeenCalledWith(
        mockGameId,
        1,
        10,
        'createdAt',
        'desc'
      );
    });

    it('should throw NotFoundError if game does not exist', async () => {
      (gameRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewService.getGameReviews(mockGameId, {
          page: 1,
          limit: 10,
          sortBy: 'helpfulCount',
          sortOrder: 'desc',
        })
      ).rejects.toThrow(NotFoundError);

      expect(reviewRepository.findByGame).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update review content successfully', async () => {
      const updatedReview = {
        ...mockReview,
        content: 'Updated review content',
      };

      (reviewRepository.findById as jest.Mock)
        .mockResolvedValueOnce(mockReview)
        .mockResolvedValueOnce(updatedReview);
      (reviewRepository.updateContent as jest.Mock).mockResolvedValue(updatedReview);

      const result = await reviewService.update(mockReviewId, mockUserId, {
        content: 'Updated review content',
      });

      expect(reviewRepository.updateContent).toHaveBeenCalledWith(mockReviewId, {
        content: 'Updated review content',
        spoilers: undefined,
      });
      expect(result).toEqual(updatedReview);
    });

    it('should update spoiler flag', async () => {
      const updatedReview = {
        ...mockReview,
        spoilers: true,
      };

      (reviewRepository.findById as jest.Mock)
        .mockResolvedValueOnce(mockReview)
        .mockResolvedValueOnce(updatedReview);
      (reviewRepository.updateContent as jest.Mock).mockResolvedValue(updatedReview);

      const result = await reviewService.update(mockReviewId, mockUserId, {
        spoilers: true,
      });

      expect(reviewRepository.updateContent).toHaveBeenCalledWith(mockReviewId, {
        content: undefined,
        spoilers: true,
      });
      expect(result).toBeDefined();
      expect((result as any).spoilers).toBe(true);
    });

    it('should throw NotFoundError if review does not exist', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewService.update(mockReviewId, mockUserId, {
          content: 'Updated content',
        })
      ).rejects.toThrow(NotFoundError);

      expect(reviewRepository.updateContent).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError if user is not the owner', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);

      await expect(
        reviewService.update(mockReviewId, 'different-user-id', {
          content: 'Updated content',
        })
      ).rejects.toThrow(ForbiddenError);

      expect(reviewRepository.updateContent).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete review successfully', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);
      (reviewRepository.delete as jest.Mock).mockResolvedValue(mockReview);

      const result = await reviewService.delete(mockReviewId, mockUserId);

      expect(reviewRepository.delete).toHaveBeenCalledWith(mockReviewId);
      expect(result).toEqual({ message: 'Review deleted successfully' });
    });

    it('should throw NotFoundError if review does not exist', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewService.delete(mockReviewId, mockUserId)
      ).rejects.toThrow(NotFoundError);

      expect(reviewRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError if user is not the owner', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);

      await expect(
        reviewService.delete(mockReviewId, 'different-user-id')
      ).rejects.toThrow(ForbiddenError);

      expect(reviewRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('markHelpful', () => {
    it('should mark review as helpful successfully', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);
      (reviewRepository.hasUserVotedHelpful as jest.Mock).mockResolvedValue(false);
      (reviewRepository.addHelpfulVote as jest.Mock).mockResolvedValue(undefined);

      const result = await reviewService.markHelpful(mockReviewId, 'other-user-id');

      expect(reviewRepository.hasUserVotedHelpful).toHaveBeenCalledWith(mockReviewId, 'other-user-id');
      expect(reviewRepository.addHelpfulVote).toHaveBeenCalledWith(mockReviewId, 'other-user-id');
      expect(result).toEqual({ message: 'Review marked as helpful' });
    });

    it('should throw NotFoundError if review does not exist', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewService.markHelpful(mockReviewId, 'other-user-id')
      ).rejects.toThrow(NotFoundError);

      expect(reviewRepository.addHelpfulVote).not.toHaveBeenCalled();
    });

    it('should throw ConflictError if user tries to mark own review', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);

      await expect(
        reviewService.markHelpful(mockReviewId, mockUserId)
      ).rejects.toThrow(ConflictError);

      expect(reviewRepository.addHelpfulVote).not.toHaveBeenCalled();
    });

    it('should throw ConflictError if already marked helpful', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);
      (reviewRepository.hasUserVotedHelpful as jest.Mock).mockResolvedValue(true);

      await expect(
        reviewService.markHelpful(mockReviewId, 'other-user-id')
      ).rejects.toThrow(ConflictError);

      expect(reviewRepository.addHelpfulVote).not.toHaveBeenCalled();
    });
  });

  describe('unmarkHelpful', () => {
    it('should remove helpful mark successfully', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);
      (reviewRepository.hasUserVotedHelpful as jest.Mock).mockResolvedValue(true);
      (reviewRepository.removeHelpfulVote as jest.Mock).mockResolvedValue(undefined);

      const result = await reviewService.unmarkHelpful(mockReviewId, 'other-user-id');

      expect(reviewRepository.hasUserVotedHelpful).toHaveBeenCalledWith(mockReviewId, 'other-user-id');
      expect(reviewRepository.removeHelpfulVote).toHaveBeenCalledWith(mockReviewId, 'other-user-id');
      expect(result).toEqual({ message: 'Helpful mark removed' });
    });

    it('should throw NotFoundError if review does not exist', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewService.unmarkHelpful(mockReviewId, 'other-user-id')
      ).rejects.toThrow(NotFoundError);

      expect(reviewRepository.removeHelpfulVote).not.toHaveBeenCalled();
    });

    it('should throw ConflictError if user has not voted', async () => {
      (reviewRepository.findById as jest.Mock).mockResolvedValue(mockReview);
      (reviewRepository.hasUserVotedHelpful as jest.Mock).mockResolvedValue(false);

      await expect(
        reviewService.unmarkHelpful(mockReviewId, 'other-user-id')
      ).rejects.toThrow(ConflictError);

      expect(reviewRepository.removeHelpfulVote).not.toHaveBeenCalled();
    });
  });

  describe('getUserReviews', () => {
    it('should return user\'s reviews', async () => {
      const mockPaginatedReviews = {
        data: [mockReview],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (reviewRepository.findByUser as jest.Mock).mockResolvedValue(mockPaginatedReviews);

      const result = await reviewService.getUserReviews(mockUserId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(reviewRepository.findByUser).toHaveBeenCalledWith(
        mockUserId,
        1,
        10,
        'createdAt',
        'desc'
      );
      expect(result).toEqual(mockPaginatedReviews);
    });
  });

  describe('getRecentReviews', () => {
    it('should return user\'s recent reviews', async () => {
      (reviewRepository.getRecentByUser as jest.Mock).mockResolvedValue([mockReview]);

      const result = await reviewService.getRecentReviews(mockUserId, 5);

      expect(reviewRepository.getRecentByUser).toHaveBeenCalledWith(mockUserId, 5);
      expect(result).toEqual([mockReview]);
    });
  });

  describe('getRecentPlatformReviews', () => {
    it('should return platform-wide recent reviews', async () => {
      (reviewRepository.getRecentReviews as jest.Mock).mockResolvedValue([mockReview]);

      const result = await reviewService.getRecentPlatformReviews(10);

      expect(reviewRepository.getRecentReviews).toHaveBeenCalledWith(10);
      expect(result).toEqual([mockReview]);
    });
  });

  describe('hasUserReviewed', () => {
    it('should return true if user has reviewed', async () => {
      (reviewRepository.hasUserReviewed as jest.Mock).mockResolvedValue(true);

      const result = await reviewService.hasUserReviewed(mockUserId, mockGameId);

      expect(reviewRepository.hasUserReviewed).toHaveBeenCalledWith(mockUserId, mockGameId);
      expect(result).toBe(true);
    });

    it('should return false if user has not reviewed', async () => {
      (reviewRepository.hasUserReviewed as jest.Mock).mockResolvedValue(false);

      const result = await reviewService.hasUserReviewed(mockUserId, mockGameId);

      expect(result).toBe(false);
    });
  });

  describe('getUserHelpfulVotes', () => {
    it('should return review IDs user has voted helpful', async () => {
      const reviewIds = ['review-1', 'review-2', 'review-3'];
      const votedIds = ['review-1', 'review-3'];

      (reviewRepository.getUserHelpfulVotes as jest.Mock).mockResolvedValue(votedIds);

      const result = await reviewService.getUserHelpfulVotes(mockUserId, reviewIds);

      expect(reviewRepository.getUserHelpfulVotes).toHaveBeenCalledWith(mockUserId, reviewIds);
      expect(result).toEqual(votedIds);
    });
  });
});
