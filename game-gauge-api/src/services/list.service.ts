import { listRepository } from '../repositories/list.repository';
import { gameRepository } from '../repositories/game.repository';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.util';
import {
  CreateListInput,
  UpdateListInput,
  AddGameToListInput,
  UpdateListItemInput,
  ReorderListItemsInput,
  GetListsQuery,
} from '../validators/list.validator';

export class ListService {
  /**
   * Create a new list
   */
  async create(userId: string, data: CreateListInput) {
    const list = await listRepository.create({
      name: data.name,
      description: data.description,
      isPublic: data.isPublic,
      user: {
        connect: { id: userId },
      },
    });

    return list;
  }

  /**
   * Get a single list by ID
   * Checks privacy settings
   */
  async findById(listId: string, requestingUserId?: string) {
    const list = await listRepository.findById(listId);

    if (!list) {
      throw new NotFoundError('List not found');
    }

    // Check privacy
    if (!list.isPublic && list.userId !== requestingUserId) {
      throw new ForbiddenError('This list is private');
    }

    return list;
  }

  /**
   * Get all lists by a user
   */
  async getUserLists(userId: string, query: GetListsQuery, requestingUserId?: string) {
    const { page, limit } = query;
    const result = await listRepository.findByUser(userId, page, limit);

    // Filter out private lists if not the owner
    if (requestingUserId !== userId) {
      result.data = result.data.filter((list) => list.isPublic);
      result.pagination.total = result.data.length;
      result.pagination.totalPages = Math.ceil(result.data.length / limit);
    }

    return result;
  }

  /**
   * Get public lists (discovery)
   */
  async getPublicLists(query: GetListsQuery) {
    const { page, limit } = query;
    return listRepository.findPublicLists(page, limit);
  }

  /**
   * Update a list
   */
  async update(listId: string, userId: string, data: UpdateListInput) {
    const list = await listRepository.findById(listId);

    if (!list) {
      throw new NotFoundError('List not found');
    }

    // Check ownership
    if (list.userId !== userId) {
      throw new ForbiddenError('You can only edit your own lists');
    }

    const updatedList = await listRepository.update(listId, data);
    return updatedList;
  }

  /**
   * Delete a list
   */
  async delete(listId: string, userId: string) {
    const list = await listRepository.findById(listId);

    if (!list) {
      throw new NotFoundError('List not found');
    }

    // Check ownership
    if (list.userId !== userId) {
      throw new ForbiddenError('You can only delete your own lists');
    }

    await listRepository.delete(listId);
    return { message: 'List deleted successfully' };
  }

  /**
   * Add game to list
   */
  async addGameToList(listId: string, userId: string, data: AddGameToListInput) {
    // Check if list exists and user owns it
    const list = await listRepository.findById(listId);
    if (!list) {
      throw new NotFoundError('List not found');
    }

    if (list.userId !== userId) {
      throw new ForbiddenError('You can only add games to your own lists');
    }

    // Check if game exists
    const game = await gameRepository.findById(data.gameId);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    // Check if game is already in list
    const isInList = await listRepository.isGameInList(listId, data.gameId);
    if (isInList) {
      throw new ConflictError('Game is already in this list');
    }

    // Add game to list
    const listItem = await listRepository.addGameToList(
      listId,
      data.gameId,
      data.notes
    );

    return listItem;
  }

  /**
   * Remove game from list
   */
  async removeGameFromList(listId: string, gameId: string, userId: string) {
    // Check if list exists and user owns it
    const list = await listRepository.findById(listId);
    if (!list) {
      throw new NotFoundError('List not found');
    }

    if (list.userId !== userId) {
      throw new ForbiddenError('You can only remove games from your own lists');
    }

    // Check if game is in list
    const isInList = await listRepository.isGameInList(listId, gameId);
    if (!isInList) {
      throw new NotFoundError('Game not found in list');
    }

    await listRepository.removeGameFromList(listId, gameId);
    return { message: 'Game removed from list' };
  }

  /**
   * Update list item (notes, order)
   */
  async updateListItem(
    listId: string,
    gameId: string,
    userId: string,
    data: UpdateListItemInput
  ) {
    // Check if list exists and user owns it
    const list = await listRepository.findById(listId);
    if (!list) {
      throw new NotFoundError('List not found');
    }

    if (list.userId !== userId) {
      throw new ForbiddenError('You can only edit your own lists');
    }

    // Check if game is in list
    const isInList = await listRepository.isGameInList(listId, gameId);
    if (!isInList) {
      throw new NotFoundError('Game not found in list');
    }

    const updatedItem = await listRepository.updateListItem(listId, gameId, data);
    return updatedItem;
  }

  /**
   * Reorder items in a list
   */
  async reorderItems(listId: string, userId: string, data: ReorderListItemsInput) {
    // Check if list exists and user owns it
    const list = await listRepository.findById(listId);
    if (!list) {
      throw new NotFoundError('List not found');
    }

    if (list.userId !== userId) {
      throw new ForbiddenError('You can only reorder your own lists');
    }

    // Verify all items belong to this list
    for (const item of data.items) {
      const listItem = await listRepository.findListItemById(item.id);
      if (!listItem || listItem.listId !== listId) {
        throw new NotFoundError(`List item ${item.id} not found in this list`);
      }
    }

    // Reorder items
    await listRepository.reorderItems(data.items);
    return { message: 'List reordered successfully' };
  }

  /**
   * Get lists containing a specific game
   */
  async getListsContainingGame(gameId: string) {
    // Check if game exists
    const game = await gameRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError('Game not found');
    }

    return listRepository.findListsContainingGame(gameId);
  }

  /**
   * Get popular lists
   */
  async getPopularLists(limit: number = 10) {
    return listRepository.findPopularLists(limit);
  }
}

export const listService = new ListService();
