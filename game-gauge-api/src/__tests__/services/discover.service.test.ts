import { GameRepository } from '../../repositories/game.repository';
import { prisma } from '../../config/database';

describe('GameRepository — genre-filtered browse', () => {
  let repo: GameRepository;

  beforeEach(() => {
    repo = new GameRepository();
  });

  describe('getTopRated', () => {
    it('calls $queryRaw with genre WHERE clause when genre is provided', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      await repo.getTopRated(6, 'Role-playing (RPG)');
      expect(prisma.$queryRaw as jest.Mock).toHaveBeenCalled();
      const call = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
      // Prisma.sql template produces a TemplateStringsArray-based object
      expect(JSON.stringify(call)).toContain('Role-playing (RPG)');
    });

    it('calls $queryRaw without genre clause when genre is omitted', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      await repo.getTopRated(6);
      expect(prisma.$queryRaw as jest.Mock).toHaveBeenCalled();
    });
  });

  describe('getTrending', () => {
    it('calls $queryRaw with genre filter when genre provided', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      await repo.getTrending(7, 6, 'Action');
      expect(prisma.$queryRaw as jest.Mock).toHaveBeenCalled();
    });
  });

  describe('findByIgdbIds', () => {
    it('returns empty array when no ids provided', async () => {
      const result = await repo.findByIgdbIds([]);
      expect(result).toEqual([]);
    });

    it('calls $queryRaw with provided igdb ids', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { igdbId: 1234, slug: 'game-one', averageRating: 8.5, ratingCount: 10 },
      ]);
      const result = await repo.findByIgdbIds([1234, 5678]);
      expect(result).toHaveLength(1);
      expect(result[0].igdbId).toBe(1234);
    });
  });
});
