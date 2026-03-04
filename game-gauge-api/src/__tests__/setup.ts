// Mock the database config module
jest.mock('../config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    game: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    rating: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    review: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    reviewHelpful: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    gameList: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    gameListItem: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// ──────────────────────────────────────────────
// Shared test fixtures
// ──────────────────────────────────────────────

/** A standard email/password user (no Steam linked) */
export const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  username: 'testuser',
  password: 'hashedPassword123',
  firstName: 'Test',
  lastName: 'User',
  avatar: null,
  bio: null,
  steamId: null,
  steamUsername: null,
  steamAvatar: null,
  steamProfileUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** A user who signed up via Steam (no email/password) */
export const testSteamOnlyUser = {
  id: 'steam-only-user-id',
  email: null,
  username: 'steam_gamer',
  password: null,
  firstName: null,
  lastName: null,
  avatar: 'https://avatars.steamstatic.com/abc123_full.jpg',
  bio: null,
  steamId: '76561198000000001',
  steamUsername: 'SteamGamer',
  steamAvatar: 'https://avatars.steamstatic.com/abc123_full.jpg',
  steamProfileUrl: 'https://steamcommunity.com/profiles/76561198000000001',
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** A user who has both email/password AND Steam linked */
export const testLinkedUser = {
  id: 'linked-user-id',
  email: 'linked@example.com',
  username: 'linkeduser',
  password: 'hashedPassword456',
  firstName: 'Linked',
  lastName: 'User',
  avatar: 'https://example.com/custom-avatar.jpg',
  bio: 'I play games',
  steamId: '76561198000000002',
  steamUsername: 'LinkedGamer',
  steamAvatar: 'https://avatars.steamstatic.com/def456_full.jpg',
  steamProfileUrl: 'https://steamcommunity.com/profiles/76561198000000002',
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Reusable Steam profile data (as returned by the passport strategy) */
export const testSteamProfile = {
  steamId: '76561198000000099',
  username: 'NewSteamUser',
  avatar: 'https://avatars.steamstatic.com/new_full.jpg',
  profileUrl: 'https://steamcommunity.com/profiles/76561198000000099',
};

export const testGame = {
  id: 'test-game-id',
  title: 'Test Game',
  slug: 'test-game',
  description: 'A test game',
  releaseDate: new Date('2023-01-01'),
  developer: 'Test Developer',
  publisher: 'Test Publisher',
  genres: ['Action', 'RPG'],
  platforms: ['PC', 'PS5'],
  coverImage: 'test-cover.jpg',
  igdbId: 12345,
  metacritic: 85,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const testRating = {
  id: 'test-rating-id',
  score: 8,
  userId: testUser.id,
  gameId: testGame.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const testReview = {
  id: 'test-review-id',
  content: 'This is a great game!',
  userId: testUser.id,
  gameId: testGame.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const testList = {
  id: 'test-list-id',
  name: 'My Favorites',
  description: 'Games I love',
  isPublic: true,
  userId: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};
