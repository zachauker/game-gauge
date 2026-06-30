import { userService } from '../../services/user.service';
import { NotFoundError } from '../../utils/errors.util';
import { testUser, testGame, testRating } from '../setup';

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

jest.mock('../../repositories/rating.repository', () => ({
  ratingRepository: {
    findByUserProfile: jest.fn(),
  },
}));

import { userRepository } from '../../repositories/user.repository';
import { ratingRepository } from '../../repositories/rating.repository';

const mockRatingPage = {
  items: [
    {
      id: testRating.id,
      score: testRating.score,
      createdAt: testRating.createdAt,
      game: { id: testGame.id, title: testGame.title, slug: testGame.slug, coverImage: testGame.coverImage },
    },
  ],
  total: 1,
  page: 1,
  hasMore: false,
};

describe('UserService.getUserRatings', () => {
  beforeEach(() => {
    (userRepository.getProfile as jest.Mock).mockResolvedValue(testUser);
    (ratingRepository.findByUserProfile as jest.Mock).mockResolvedValue(mockRatingPage);
  });

  it('returns paginated ratings for the user', async () => {
    const result = await userService.getUserRatings(testUser.username, 1, 20);
    expect(ratingRepository.findByUserProfile).toHaveBeenCalledWith(testUser.id, 1, 20);
    expect(result).toEqual(mockRatingPage);
  });

  it('throws NotFoundError when user does not exist', async () => {
    (userRepository.getProfile as jest.Mock).mockResolvedValue(null);
    await expect(userService.getUserRatings('ghost', 1, 20)).rejects.toThrow(NotFoundError);
  });
});
