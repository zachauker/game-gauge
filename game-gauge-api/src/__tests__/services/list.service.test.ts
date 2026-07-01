import { ListService } from '../../services/list.service';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from '../../utils/errors.util';
import {
  testUser,
  testLinkedUser,
  testGame,
  testList,
  testPlayingList,
  testWishlist,
  testCompletedList,
  testListItem,
} from '../setup';
import { prisma } from '../../config/database';
import { updateListSchema } from '../../validators/list.validator';
// ──────────────────────────────────────────────
// Mock steam-api.service so tests never hit the
// real Steam API, and we can control responses.
// ──────────────────────────────────────────────
jest.mock('../../services/steam-api.service', () => ({
  steamApiService: {
    getPlayerAchievements: jest.fn(),
  },
}));

jest.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findById: jest.fn(),
  },
}));

import { steamApiService } from '../../services/steam-api.service';
import { userRepository } from '../../repositories/user.repository';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Wire up the findById mock to return a list that looks like `listOverrides`. */
function mockList(listOverrides: object) {
  (prisma.gameList.findUnique as jest.Mock).mockResolvedValue({
    ...testPlayingList,
    ...listOverrides,
    items: [],
    _count: { items: 0 },
  });
}

function mockGameInList(inList = true) {
  (prisma.gameListItem.count as jest.Mock).mockResolvedValue(inList ? 1 : 0);
}

describe('ListService', () => {
  let listService: ListService;

  beforeEach(() => {
    listService = new ListService();
  });

  describe('create', () => {
    const createListData = {
      name: 'My Favorites',
      description: 'Games I love',
      isPublic: true,
    };

    it('should create a new list successfully', async () => {
      // Arrange
      (prisma.gameList.create as jest.Mock).mockResolvedValue(testList);

      // Act
      const result = await listService.create(testUser.id, createListData);

      // Assert
      expect(prisma.gameList.create).toHaveBeenCalledWith({
        data: {
          name: createListData.name,
          description: createListData.description,
          isPublic: createListData.isPublic,
          user: {
            connect: { id: testUser.id },
          },
        },
      });
      expect(result).toEqual(testList);
    });
  });

  describe('findById', () => {
    it('should return list if user is owner', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act
      const result = await listService.findById(testList.id, testUser.id);

      // Assert
      expect(result).toEqual(testList);
    });

    it('should return public list for non-owner', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act
      const result = await listService.findById(testList.id, 'other-user-id');

      // Assert
      expect(result).toEqual(testList);
    });

    it('should throw ForbiddenError for private list of non-owner', async () => {
      // Arrange
      const privateList = { ...testList, isPublic: false };
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(privateList);

      // Act & Assert
      await expect(listService.findById(testList.id, 'other-user-id')).rejects.toThrow(
        ForbiddenError
      );
    });

    it('should throw NotFoundError if list does not exist', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(listService.findById('invalid-id', testUser.id)).rejects.toThrow(NotFoundError);
    });

    it('passes the viewer id through so per-viewer rating data is fetched', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act
      await listService.findById(testList.id, 'viewer-id');

      // Assert
      expect(prisma.gameList.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testList.id },
          include: expect.objectContaining({
            items: expect.objectContaining({
              include: expect.objectContaining({
                game: expect.objectContaining({
                  select: expect.objectContaining({
                    genres: true,
                    platforms: true,
                    ratings: { where: { userId: 'viewer-id' }, select: { score: true }, take: 1 },
                  }),
                }),
              }),
            }),
          }),
        })
      );
    });

    it('omits the ratings include when there is no viewer (anonymous request)', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act
      await listService.findById(testList.id, undefined);

      // Assert
      expect(prisma.gameList.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            items: expect.objectContaining({
              include: expect.objectContaining({
                game: expect.objectContaining({
                  select: expect.objectContaining({ ratings: false }),
                }),
              }),
            }),
          }),
        })
      );
    });

    it('grants access to a private list when it was shared with the viewer in a message', async () => {
      const privateList = { ...testList, isPublic: false, userId: testLinkedUser.id };
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(privateList);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);

      const result = await listService.findById(privateList.id, testUser.id);

      expect(prisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'LIST_SHARE', listId: privateList.id }),
        })
      );
      expect(result).toEqual(privateList);
    });

    it('denies access to a private list with no share and no ownership', async () => {
      const privateList = { ...testList, isPublic: false, userId: testLinkedUser.id };
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(privateList);
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      await expect(listService.findById(privateList.id, testUser.id)).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('getUserLists', () => {
    it('should return all lists for user', async () => {
      // Arrange
      const mockResult = {
        data: [testList, { ...testList, id: 'list-2' }],
        pagination: {
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };
      (prisma.gameList.findMany as jest.Mock).mockResolvedValue(mockResult.data);
      (prisma.gameList.count as jest.Mock).mockResolvedValue(2);

      // Act
      const result = await listService.getUserLists(
        testUser.id,
        { page: 1, limit: 10 },
        testUser.id
      );

      // Assert
      expect(result).toHaveProperty('data');
      expect(prisma.gameList.findMany).toHaveBeenCalled();
    });

    it('should filter private lists for non-owner', async () => {
      // Arrange
      const publicList = { ...testList, id: 'list-1', isPublic: true };
      const privateList = { ...testList, id: 'list-2', isPublic: false };
      const mockResult = {
        data: [publicList, privateList],
        pagination: {
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };
      (prisma.gameList.findMany as jest.Mock).mockResolvedValue(mockResult.data);
      (prisma.gameList.count as jest.Mock).mockResolvedValue(2);

      // Act
      const result = await listService.getUserLists(
        testUser.id,
        { page: 1, limit: 10 },
        'other-user-id'
      );

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].isPublic).toBe(true);
    });
  });

  describe('getPublicLists', () => {
    it('should return public lists', async () => {
      // Arrange
      (prisma.gameList.findMany as jest.Mock).mockResolvedValue([testList]);
      (prisma.gameList.count as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await listService.getPublicLists({ page: 1, limit: 10 });

      // Assert
      expect(result).toHaveProperty('data');
      expect(prisma.gameList.findMany).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateData = {
      name: 'Updated List',
      description: 'Updated description',
    };

    it('should update list successfully', async () => {
      // Arrange
      const updatedList = { ...testList, ...updateData };
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.gameList.update as jest.Mock).mockResolvedValue(updatedList);

      // Act
      const result = await listService.update(testList.id, testUser.id, updateData);

      // Assert
      expect(prisma.gameList.update).toHaveBeenCalled();
      expect(result.name).toBe(updateData.name);
    });

    it('should persist sortBy and sortDir', async () => {
      // Arrange
      const sortUpdate = { sortBy: 'title' as const, sortDir: 'desc' as const };
      const updatedList = { ...testList, ...sortUpdate };
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.gameList.update as jest.Mock).mockResolvedValue(updatedList);

      // Act
      const result = await listService.update(testList.id, testUser.id, sortUpdate);

      // Assert
      expect(prisma.gameList.update).toHaveBeenCalledWith({
        where: { id: testList.id },
        data: sortUpdate,
      });
      expect(result.sortBy).toBe('title');
      expect(result.sortDir).toBe('desc');
    });

    it('should reject an invalid sortBy value at the validator level', () => {
      expect(() => updateListSchema.parse({ sortBy: 'not-a-real-field' })).toThrow();
    });

    it('should throw ForbiddenError if user is not list owner', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act & Assert
      await expect(listService.update(testList.id, 'other-user-id', updateData)).rejects.toThrow(
        ForbiddenError
      );
    });

    it('should throw NotFoundError if list does not exist', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(listService.update('invalid-id', testUser.id, updateData)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('delete', () => {
    it('should delete list successfully', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.gameList.delete as jest.Mock).mockResolvedValue(testList);

      // Act
      const result = await listService.delete(testList.id, testUser.id);

      // Assert
      expect(prisma.gameList.delete).toHaveBeenCalledWith({
        where: { id: testList.id },
      });
      expect(result).toHaveProperty('message');
    });

    it('should throw ForbiddenError if user is not list owner', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act & Assert
      await expect(listService.delete(testList.id, 'other-user-id')).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('addGameToList', () => {
    const addGameData = {
      gameId: testGame.id,
      notes: 'Great game!',
    };

    it('should add game to list successfully', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
      (prisma.gameListItem.count as jest.Mock).mockResolvedValue(0); // Game not in list
      (prisma.gameListItem.aggregate as jest.Mock).mockResolvedValue({
        _max: { order: 4 },
      });
      (prisma.gameListItem.create as jest.Mock).mockResolvedValue({
        id: 'item-id',
        listId: testList.id,
        gameId: testGame.id,
        notes: addGameData.notes,
        order: 5,
        addedAt: new Date(),
      });

      // Act
      const result = await listService.addGameToList(testList.id, testUser.id, addGameData);

      // Assert
      expect(prisma.gameList.findUnique).toHaveBeenCalled();
      expect(prisma.game.findUnique).toHaveBeenCalled();
      expect(prisma.gameListItem.count).toHaveBeenCalledWith({
        where: {
          listId: testList.id,
          gameId: addGameData.gameId,
        },
      });
      expect(prisma.gameListItem.aggregate).toHaveBeenCalledWith({
        where: { listId: testList.id },
        _max: { order: true },
      });
      expect(prisma.gameListItem.create).toHaveBeenCalled();
      expect(result).toHaveProperty('gameId', testGame.id);
    });

    it('should throw ForbiddenError if user is not list owner', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act & Assert
      await expect(
        listService.addGameToList(testList.id, 'other-user-id', addGameData)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        listService.addGameToList(testList.id, testUser.id, { gameId: 'invalid-game-id' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError if game already in list', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
      (prisma.gameListItem.count as jest.Mock).mockResolvedValue(1); // Game already in list

      // Act & Assert
      await expect(
        listService.addGameToList(testList.id, testUser.id, addGameData)
      ).rejects.toThrow(ConflictError);

      // Verify it checked for existing game
      expect(prisma.gameListItem.count).toHaveBeenCalledWith({
        where: {
          listId: testList.id,
          gameId: addGameData.gameId,
        },
      });

      // Verify it didn't try to create
      expect(prisma.gameListItem.aggregate).not.toHaveBeenCalled();
      expect(prisma.gameListItem.create).not.toHaveBeenCalled();
    });
  });

  describe('removeGameFromList', () => {
    it('should remove game from list successfully', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.gameListItem.count as jest.Mock).mockResolvedValue(1); // Game is in list
      (prisma.gameListItem.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      // Act
      const result = await listService.removeGameFromList(testList.id, testGame.id, testUser.id);

      // Assert
      expect(prisma.gameListItem.count).toHaveBeenCalledWith({
        where: {
          listId: testList.id,
          gameId: testGame.id,
        },
      });
      expect(result).toHaveProperty('message');
    });

    it('should throw ForbiddenError if user is not list owner', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);

      // Act & Assert
      await expect(
        listService.removeGameFromList(testList.id, testGame.id, 'other-user-id')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if game not in list', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.gameListItem.count as jest.Mock).mockResolvedValue(0); // Game not in list

      // Act & Assert
      await expect(
        listService.removeGameFromList(testList.id, testGame.id, testUser.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getListsContainingGame', () => {
    it('should return lists containing game', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
      (prisma.gameList.findMany as jest.Mock).mockResolvedValue([testList]);

      // Act
      const result = await listService.getListsContainingGame(testGame.id);

      // Assert
      expect(result).toHaveLength(1);
      expect(prisma.game.findUnique).toHaveBeenCalled();
      expect(prisma.gameList.findMany).toHaveBeenCalled();
    });

    it('should throw NotFoundError if game does not exist', async () => {
      // Arrange
      (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(listService.getListsContainingGame('invalid-game-id')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('getPopularLists', () => {
    it('should return popular lists', async () => {
      // Arrange
      (prisma.gameList.findMany as jest.Mock).mockResolvedValue([testList]);

      // Act
      const result = await listService.getPopularLists(10);

      // Assert
      expect(prisma.gameList.findMany).toHaveBeenCalled();
      expect(result).toEqual([testList]);
    });
  });

  // ──────────────────────────────────────────────
  // Suite
  // ──────────────────────────────────────────────

  describe('ListService — default list features', () => {
    let listService: ListService;

    beforeEach(() => {
      listService = new ListService();
    });

    // ────────────────────────────────────────────
    // getDefaultLists
    // ────────────────────────────────────────────
    describe('getDefaultLists', () => {
      it('returns all three default lists indexed by type', async () => {
        const rows = [
          { id: testWishlist.id, listType: 'wishlist', name: 'Wishlist' },
          { id: testPlayingList.id, listType: 'playing', name: 'Currently Playing' },
          { id: testCompletedList.id, listType: 'completed', name: 'Completed' },
        ];
        (prisma.gameList.findMany as jest.Mock).mockResolvedValue(rows);

        const result = await listService.getDefaultLists(testUser.id);

        expect(prisma.gameList.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId: testUser.id, isDefault: true },
          })
        );
        expect(result.wishlist?.id).toBe(testWishlist.id);
        expect(result.currentlyPlaying?.id).toBe(testPlayingList.id);
        expect(result.completed?.id).toBe(testCompletedList.id);
      });

      it('returns null for a missing default list type', async () => {
        // Only wishlist and playing exist (completed was somehow missing)
        (prisma.gameList.findMany as jest.Mock).mockResolvedValue([
          { id: testWishlist.id, listType: 'wishlist', name: 'Wishlist' },
          { id: testPlayingList.id, listType: 'playing', name: 'Currently Playing' },
        ]);

        const result = await listService.getDefaultLists(testUser.id);

        expect(result.completed).toBeNull();
      });
    });

    // ────────────────────────────────────────────
    // updateListItem — progress tracking
    // ────────────────────────────────────────────
    describe('updateListItem — progress tracking', () => {
      const updatedItem = { ...testListItem, progressPct: 42, progressNote: 'Just started act 2' };

      it('saves progressPct and progressNote on a playing list', async () => {
        mockList({ listType: 'playing' });
        mockGameInList(true);
        (prisma.gameListItem.update as jest.Mock).mockResolvedValue(updatedItem);

        const result = await listService.updateListItem(
          testPlayingList.id,
          testGame.id,
          testUser.id,
          { progressPct: 42, progressNote: 'Just started act 2' }
        );

        expect(prisma.gameListItem.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ progressPct: 42, progressNote: 'Just started act 2' }),
          })
        );
        expect(result).toEqual(updatedItem);
      });

      it('rejects progressPct on a non-playing list', async () => {
        mockList({ listType: 'completed' });
        mockGameInList(true);

        await expect(
          listService.updateListItem(testCompletedList.id, testGame.id, testUser.id, {
            progressPct: 50,
          })
        ).rejects.toThrow(BadRequestError);

        expect(prisma.gameListItem.update).not.toHaveBeenCalled();
      });

      it('rejects progressNote on a wishlist list', async () => {
        mockList({ listType: 'wishlist' });
        mockGameInList(true);

        await expect(
          listService.updateListItem(testWishlist.id, testGame.id, testUser.id, {
            progressNote: 'This should fail',
          })
        ).rejects.toThrow(BadRequestError);
      });

      it('allows updating notes without progressPct on any list type', async () => {
        mockList({ listType: 'completed' });
        mockGameInList(true);
        const notesOnly = { ...testListItem, notes: 'Great ending' };
        (prisma.gameListItem.update as jest.Mock).mockResolvedValue(notesOnly);

        const result = await listService.updateListItem(
          testCompletedList.id,
          testGame.id,
          testUser.id,
          { notes: 'Great ending' }
        );

        expect(result).toEqual(notesOnly);
      });

      it('throws ForbiddenError when user does not own the list', async () => {
        mockList({ listType: 'playing', userId: 'someone-else' });

        await expect(
          listService.updateListItem(testPlayingList.id, testGame.id, testUser.id, {
            progressPct: 10,
          })
        ).rejects.toThrow(ForbiddenError);
      });

      it('throws NotFoundError when game is not in the list', async () => {
        mockList({ listType: 'playing' });
        mockGameInList(false);

        await expect(
          listService.updateListItem(testPlayingList.id, testGame.id, testUser.id, {
            progressPct: 10,
          })
        ).rejects.toThrow(NotFoundError);
      });
    });

    // ────────────────────────────────────────────
    // delete — default list guard
    // ────────────────────────────────────────────
    describe('delete — default list guard', () => {
      it('prevents deleting a default list', async () => {
        mockList({ isDefault: true, userId: testUser.id });

        await expect(listService.delete(testPlayingList.id, testUser.id)).rejects.toThrow(
          ForbiddenError
        );

        expect(prisma.gameList.delete).not.toHaveBeenCalled();
      });

      it('allows deleting a custom list', async () => {
        (prisma.gameList.findUnique as jest.Mock).mockResolvedValue({
          ...testList,
          isDefault: false,
          items: [],
          _count: { items: 0 },
        });
        (prisma.gameList.delete as jest.Mock).mockResolvedValue(testList);

        const result = await listService.delete(testList.id, testUser.id);

        expect(prisma.gameList.delete).toHaveBeenCalled();
        expect(result).toEqual({ message: 'List deleted successfully' });
      });
    });

    // ────────────────────────────────────────────
    // syncAchievements
    // ────────────────────────────────────────────
    describe('syncAchievements', () => {
      const mockAchievements = [
        { apiname: 'ACH_1', achieved: 1, unlocktime: 1700000000 },
        { apiname: 'ACH_2', achieved: 1, unlocktime: 1700000001 },
        { apiname: 'ACH_3', achieved: 0, unlocktime: 0 },
      ];

      it('fetches from Steam and caches the snapshot when cache is cold', async () => {
        mockList({ listType: 'playing', userId: testLinkedUser.id });
        mockGameInList(true);
        (userRepository.findById as jest.Mock).mockResolvedValue(testLinkedUser);
        (prisma.steamAppMapping.findFirst as jest.Mock).mockResolvedValue({ steamAppId: 730 });
        (prisma.gameListItem.findUnique as jest.Mock).mockResolvedValue({
          ...testListItem,
          steamAchievements: null, // cold cache
        });
        (steamApiService.getPlayerAchievements as jest.Mock).mockResolvedValue(mockAchievements);
        const updatedItem = {
          ...testListItem,
          steamAchievements: {
            earned: 2,
            total: 3,
            percentage: 67,
            lastFetched: expect.any(String),
          },
        };
        (prisma.gameListItem.update as jest.Mock).mockResolvedValue(updatedItem);

        const result = await listService.syncAchievements(
          testPlayingList.id,
          testGame.id,
          testLinkedUser.id
        );

        expect(steamApiService.getPlayerAchievements).toHaveBeenCalledWith(
          testLinkedUser.steamId,
          730
        );
        expect(prisma.gameListItem.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              steamAchievements: expect.objectContaining({ earned: 2, total: 3, percentage: 67 }),
            }),
          })
        );
        expect(result).toEqual(updatedItem);
      });

      it('returns cached data when snapshot is within the 1-hour TTL', async () => {
        mockList({ listType: 'playing', userId: testLinkedUser.id });
        mockGameInList(true);
        (userRepository.findById as jest.Mock).mockResolvedValue(testLinkedUser);
        (prisma.steamAppMapping.findFirst as jest.Mock).mockResolvedValue({ steamAppId: 730 });

        const freshFetch = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
        const cachedItem = {
          ...testListItem,
          steamAchievements: { earned: 2, total: 3, percentage: 67, lastFetched: freshFetch },
        };
        (prisma.gameListItem.findUnique as jest.Mock).mockResolvedValue(cachedItem);

        await listService.syncAchievements(testPlayingList.id, testGame.id, testLinkedUser.id);

        // Steam API should NOT be called — cache is still fresh
        expect(steamApiService.getPlayerAchievements).not.toHaveBeenCalled();
        expect(prisma.gameListItem.update).not.toHaveBeenCalled();
      });

      it('re-fetches when the cached snapshot is older than 1 hour', async () => {
        mockList({ listType: 'playing', userId: testLinkedUser.id });
        mockGameInList(true);
        (userRepository.findById as jest.Mock).mockResolvedValue(testLinkedUser);
        (prisma.steamAppMapping.findFirst as jest.Mock).mockResolvedValue({ steamAppId: 730 });

        const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
        (prisma.gameListItem.findUnique as jest.Mock).mockResolvedValue({
          ...testListItem,
          steamAchievements: { earned: 1, total: 3, percentage: 33, lastFetched: staleDate },
        });
        (steamApiService.getPlayerAchievements as jest.Mock).mockResolvedValue(mockAchievements);
        (prisma.gameListItem.update as jest.Mock).mockResolvedValue(testListItem);

        await listService.syncAchievements(testPlayingList.id, testGame.id, testLinkedUser.id);

        expect(steamApiService.getPlayerAchievements).toHaveBeenCalled();
      });

      it('throws BadRequestError when no Steam account is linked', async () => {
        mockList({ listType: 'playing', userId: testUser.id });
        mockGameInList(true);
        (userRepository.findById as jest.Mock).mockResolvedValue(testUser); // steamId: null

        await expect(
          listService.syncAchievements(testPlayingList.id, testGame.id, testUser.id)
        ).rejects.toThrow(BadRequestError);

        expect(steamApiService.getPlayerAchievements).not.toHaveBeenCalled();
      });

      it('throws NotFoundError when no SteamAppMapping exists for the game', async () => {
        mockList({ listType: 'playing', userId: testLinkedUser.id });
        mockGameInList(true);
        (userRepository.findById as jest.Mock).mockResolvedValue(testLinkedUser);
        (prisma.steamAppMapping.findFirst as jest.Mock).mockResolvedValue(null);

        await expect(
          listService.syncAchievements(testPlayingList.id, testGame.id, testLinkedUser.id)
        ).rejects.toThrow(NotFoundError);
      });

      it('throws BadRequestError when called on a non-playing list', async () => {
        mockList({ listType: 'completed', userId: testLinkedUser.id });
        mockGameInList(true);

        await expect(
          listService.syncAchievements(testCompletedList.id, testGame.id, testLinkedUser.id)
        ).rejects.toThrow(BadRequestError);
      });

      it('throws ForbiddenError when user does not own the list', async () => {
        mockList({ listType: 'playing', userId: 'another-user' });

        await expect(
          listService.syncAchievements(testPlayingList.id, testGame.id, testLinkedUser.id)
        ).rejects.toThrow(ForbiddenError);
      });
    });
  });
});
