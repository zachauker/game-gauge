import { userService } from '../../services/user.service';
import { NotFoundError } from '../../utils/errors.util';
import { testUser, testGame, testReview } from '../setup';

jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getProfile: jest.fn(),
    findById: jest.fn(),
    findByUsername: jest.fn(),
    getUserStats: jest.fn(),
    updateProfile: jest.fn(),
    updateUsername: jest.fn(),
    searchByUsername: jest.fn(),
  },
}));

jest.mock('../../repositories/review.repository', () => ({
  reviewRepository: {
    findByUserProfile: jest.fn(),
  },
}));

// userService also imports ratingRepository — stub it out
jest.mock('../../repositories/rating.repository', () => ({
  ratingRepository: {
    findByUserProfile: jest.fn(),
  },
}));

import { userRepository } from '../../repositories/user.repository';
import { reviewRepository } from '../../repositories/review.repository';

const mockReviewPage = {
  items: [
    {
      id: testReview.id,
      content: testReview.content,
      spoilers: testReview.spoilers,
      createdAt: testReview.createdAt,
      game: { id: testGame.id, title: testGame.title, slug: testGame.slug, coverImage: testGame.coverImage },
      _count: { helpfulVotes: 0 },
    },
  ],
  total: 1,
  page: 1,
  hasMore: false,
};

describe('UserService.getUserReviews', () => {
  beforeEach(() => {
    (userRepository.getProfile as jest.Mock).mockResolvedValue(testUser);
    (reviewRepository.findByUserProfile as jest.Mock).mockResolvedValue(mockReviewPage);
  });

  it('returns paginated reviews for the user', async () => {
    const result = await userService.getUserReviews(testUser.username, 1, 20);
    expect(reviewRepository.findByUserProfile).toHaveBeenCalledWith(testUser.id, 1, 20);
    expect(result).toEqual(mockReviewPage);
  });

  it('throws NotFoundError when user does not exist', async () => {
    (userRepository.getProfile as jest.Mock).mockResolvedValue(null);
    await expect(userService.getUserReviews('ghost', 1, 20)).rejects.toThrow(NotFoundError);
  });
});
