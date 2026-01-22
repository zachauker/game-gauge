import { ListService } from '../../services/list.service';
import { NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors.util';
import { testUser, testGame, testList } from '../setup';
import { prisma } from '../../config/database';

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
      expect(result).toEqual(mockResult);

      // Assert
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
      expect(result.data).toHaveLength(1);

      // Assert
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
      (prisma.gameListItem.findFirst as jest.Mock).mockResolvedValue(null);
      // Mock aggregate to return max order
      (prisma.gameListItem.aggregate as jest.Mock).mockResolvedValue({
        _max: { order: 4 },
      });

      // Mock create with next order value
      (prisma.gameListItem.create as jest.Mock).mockResolvedValue({
        id: 'item-id',
        listId: testList.id,
        gameId: testGame.id,
        notes: addGameData.notes,
        order: 5, // ✅ Next order is 5 (max 4 + 1)
        addedAt: new Date(),
      });

      // Act
      const result = await listService.addGameToList(testList.id, testUser.id, addGameData);

      // Assert
      expect(prisma.gameList.findUnique).toHaveBeenCalled();
      expect(prisma.game.findUnique).toHaveBeenCalled();
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
      (prisma.gameListItem.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-item' });

      // Act & Assert
      await expect(
        listService.addGameToList(testList.id, testUser.id, addGameData)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('removeGameFromList', () => {
    it('should remove game from list successfully', async () => {
      // Arrange
      (prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
      (prisma.gameListItem.findFirst as jest.Mock).mockResolvedValue({ id: 'item-id' });
      (prisma.gameListItem.delete as jest.Mock).mockResolvedValue({ id: 'item-id' });

      // Act
      const result = await listService.removeGameFromList(testList.id, testGame.id, testUser.id);

      // Assert
      expect(prisma.gameListItem.delete).toHaveBeenCalled();
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
      (prisma.gameListItem.findFirst as jest.Mock).mockResolvedValue(null);

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
      expect(result).toEqual([testList]);

      // Assert
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
});
