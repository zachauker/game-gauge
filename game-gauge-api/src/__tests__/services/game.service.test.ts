import { GameService } from '../../services/game.service';
import { NotFoundError, ConflictError } from '../../utils/errors.util';
import { testGame } from '../setup';
import { prisma } from '../../config/database';

// Mock slug utility
jest.mock('../../utils/slug.util', () => ({
  generateSlug: jest.fn((title: string) => title.toLowerCase().replace(/\s+/g, '-')),
  generateUniqueSlug: jest.fn(async (slug: string) => slug),
}));

describe('GameService', () => {
  let gameService: GameService;

  beforeEach(() => {
    gameService = new GameService();
  });

  describe('create', () => {
    const createGameData = {
      title: 'New Game',
      description: 'A new game',
      releaseDate: new Date('2024-01-01'),
      developer: 'New Developer',
      publisher: 'New Publisher',
      genres: ['Action'],
      platforms: ['PC'],
      coverImage: 'cover.jpg',
      igdbId: 67890,
    };

    it('should create a new game successfully', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null); // No existing game with IGDB ID
      (prisma.game.create as jest.Mock).mockResolvedValue({
        ...testGame,
        ...createGameData,
        slug: 'new-game',
      });

      // Act
      const result = await gameService.create(createGameData);

      // Assert
      expect(prisma.game.create).toHaveBeenCalled();
      expect(result.title).toBe(createGameData.title);
    });

    it('should throw ConflictError if IGDB ID already exists', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);

      // Act & Assert
      await expect(gameService.create(createGameData)).rejects.toThrow(ConflictError);
    });
  });

  describe('findById', () => {
    it('should return game by id', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);

      // Act
      const result = await gameService.findById(testGame.id);

      // Assert
      expect(prisma.game.findUnique).toHaveBeenCalledWith({
        where: { id: testGame.id },
      });
      expect(result).toEqual(testGame);
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(gameService.findById('invalid-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findBySlug', () => {
    it('should return game by slug', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);

      // Act
      const result = await gameService.findBySlug(testGame.slug);

      // Assert
      expect(prisma.game.findUnique).toHaveBeenCalledWith({
        where: { slug: testGame.slug },
      });
      expect(result).toEqual(testGame);
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(gameService.findBySlug('invalid-slug')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findAll', () => {
    it('should return paginated games', async () => {
      // Arrange
      const mockResult = {
        games: [testGame, { ...testGame, id: 'game-2' }],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      (prisma.game.findMany as jest.Mock).mockResolvedValue(mockResult.games);
      (prisma.game.count as jest.Mock).mockResolvedValue(2);

      // Act
      const result = await gameService.findAll({
        page: 1,
        limit: 10,
        sortBy: 'title',
        genre: 'Action',
        sortOrder: 'asc',
        platform: 'PC',
      });

      // Assert
      expect(prisma.game.findMany).toHaveBeenCalled();
      expect(result).toHaveProperty('games');
      expect(result).toHaveProperty('total');
    });

    it('should apply filters', async () => {
      // Arrange
      (prisma.game.findMany as jest.Mock).mockResolvedValue([testGame]);
      (prisma.game.count as jest.Mock).mockResolvedValue(1);

      // Act
      await gameService.findAll({
        page: 1,
        limit: 10,
        search: 'test',
        platform: 'PC',
        genre: 'Action',
        sortOrder: 'asc',
        sortBy: 'title',
      });

      // Assert
      expect(prisma.game.findMany).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateData = {
      title: 'Updated Game',
      description: 'Updated description',
    };

    it('should update game successfully', async () => {
      // Arrange
      const updatedGame = { ...testGame, ...updateData };
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
      (prisma.game.update as jest.Mock).mockResolvedValue(updatedGame);

      // Act
      const result = await gameService.update(testGame.id, updateData);

      // Assert
      expect(prisma.game.findUnique).toHaveBeenCalledWith({
        where: { id: testGame.id },
      });
      expect(prisma.game.update).toHaveBeenCalled();
      expect(result.title).toBe(updateData.title);
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(gameService.update('invalid-id', updateData)).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete game successfully', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
      (prisma.game.delete as jest.Mock).mockResolvedValue(testGame);

      // Act
      await gameService.delete(testGame.id);

      // Assert
      expect(prisma.game.findUnique).toHaveBeenCalledWith({
        where: { id: testGame.id },
      });
      expect(prisma.game.delete).toHaveBeenCalledWith({
        where: { id: testGame.id },
      });
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(gameService.delete('invalid-id')).rejects.toThrow(NotFoundError);
    });
  });
});
