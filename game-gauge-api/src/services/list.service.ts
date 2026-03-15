import { listRepository } from '../repositories/list.repository';
import { gameRepository } from '../repositories/game.repository';
import { steamApiService } from './steam-api.service';
import { userRepository } from '../repositories/user.repository';
import { prisma } from '../config/database';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from '../utils/errors.util';
import { logger } from '../utils/logger.util';
import {
  CreateListInput,
  UpdateListInput,
  AddGameToListInput,
  UpdateListItemInput,
  ReorderListItemsInput,
  GetListsQuery,
  CompleteGameInput,
} from '../validators/list.validator';
import { reviewRepository } from '../repositories/review.repository';
import { ratingRepository } from '../repositories/rating.repository';

// How long to use a cached achievement snapshot before re-fetching (ms)
const ACHIEVEMENT_TTL_MS = 60 * 60 * 1000; // 1 hour

export class ListService {
  /**
   * Create a new list
   */
  async create(userId: string, data: CreateListInput) {
    return listRepository.create({
      name: data.name,
      description: data.description,
      isPublic: data.isPublic,
      user: { connect: { id: userId } },
    });
  }

  /**
   * Get a single list by ID
   */
  async findById(listId: string, requestingUserId?: string) {
    const list = await listRepository.findById(listId);
    if (!list) throw new NotFoundError('List not found');

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

    if (requestingUserId !== userId) {
      result.data = result.data.filter((list) => list.isPublic);
      result.pagination.total = result.data.length;
      result.pagination.totalPages = Math.ceil(result.data.length / limit);
    }

    return result;
  }

  /**
   * Return the three default list IDs for the authenticated user.
   * Used by the frontend to avoid hardcoding list IDs.
   */
  async getDefaultLists(userId: string) {
    const lists = await prisma.gameList.findMany({
      where: { userId, isDefault: true },
      select: { id: true, listType: true, name: true },
    });

    // Index by listType for easy lookup
    const byType = Object.fromEntries(lists.map((l) => [l.listType, l]));

    return {
      wishlist: byType['wishlist'] ?? null,
      currentlyPlaying: byType['playing'] ?? null,
      completed: byType['completed'] ?? null,
    };
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
    if (!list) throw new NotFoundError('List not found');
    if (list.userId !== userId) throw new ForbiddenError('You can only edit your own lists');

    return listRepository.update(listId, data);
  }

  /**
   * Delete a list
   */
  async delete(listId: string, userId: string) {
    const list = await listRepository.findById(listId);
    if (!list) throw new NotFoundError('List not found');
    if (list.userId !== userId) throw new ForbiddenError('You can only delete your own lists');

    // Prevent deleting system-managed default lists
    if ((list as any).isDefault) {
      throw new ForbiddenError('Default lists cannot be deleted');
    }

    await listRepository.delete(listId);
    return { message: 'List deleted successfully' };
  }

  /**
   * Add game to list
   */
  async addGameToList(listId: string, userId: string, data: AddGameToListInput) {
    const list = await listRepository.findById(listId);
    if (!list) throw new NotFoundError('List not found');
    if (list.userId !== userId)
      throw new ForbiddenError('You can only add games to your own lists');

    const game = await gameRepository.findById(data.gameId);
    if (!game) throw new NotFoundError('Game not found');

    const isInList = await listRepository.isGameInList(listId, data.gameId);
    if (isInList) throw new ConflictError('Game is already in this list');

    return listRepository.addGameToList(listId, data.gameId, data.notes);
  }

  /**
   * Remove game from list
   */
  async removeGameFromList(listId: string, gameId: string, userId: string) {
    const list = await listRepository.findById(listId);
    if (!list) throw new NotFoundError('List not found');
    if (list.userId !== userId)
      throw new ForbiddenError('You can only remove games from your own lists');

    const isInList = await listRepository.isGameInList(listId, gameId);
    if (!isInList) throw new NotFoundError('Game not found in list');

    await listRepository.removeGameFromList(listId, gameId);
    return { message: 'Game removed from list' };
  }

  /**
   * Update a list item — notes, order, and progress tracking fields.
   * progressPct / progressNote are only enforced on 'playing' lists.
   */
  async updateListItem(listId: string, gameId: string, userId: string, data: UpdateListItemInput) {
    const list = await listRepository.findById(listId);
    if (!list) throw new NotFoundError('List not found');
    if (list.userId !== userId) throw new ForbiddenError('You can only edit your own lists');

    const isInList = await listRepository.isGameInList(listId, gameId);
    if (!isInList) throw new NotFoundError('Game not found in list');

    // Guard: progress fields only make sense on the Currently Playing list
    const listType = (list as any).listType as string;
    if (
      (data.progressPct !== undefined || data.progressNote !== undefined) &&
      listType !== 'playing'
    ) {
      throw new BadRequestError(
        'Progress tracking is only available on the Currently Playing list'
      );
    }

    return listRepository.updateListItem(listId, gameId, data);
  }

  /**
   * Sync Steam achievements for a game in the Currently Playing list.
   *
   * Fetches fresh data from the Steam API if the cached snapshot is older
   * than ACHIEVEMENT_TTL_MS, otherwise returns the existing cached data.
   */
  async syncAchievements(listId: string, gameId: string, userId: string) {
    const list = await listRepository.findById(listId);
    if (!list) throw new NotFoundError('List not found');
    if (list.userId !== userId) throw new ForbiddenError('You do not own this list');

    const listType = (list as any).listType as string;
    if (listType !== 'playing') {
      throw new BadRequestError('Achievement sync is only available on the Currently Playing list');
    }

    const isInList = await listRepository.isGameInList(listId, gameId);
    if (!isInList) throw new NotFoundError('Game not found in list');

    // Look up the user's Steam ID
    const user = await userRepository.findById(userId);
    if (!user?.steamId) {
      throw new BadRequestError(
        'No Steam account linked. Connect Steam in your settings to sync achievements.'
      );
    }

    // Find the Steam AppID for this game via SteamAppMapping
    const mapping = await prisma.steamAppMapping.findFirst({
      where: { gameId },
      select: { steamAppId: true },
    });

    if (!mapping) {
      throw new NotFoundError('This game has no Steam app mapping — achievements are unavailable.');
    }

    // Check cache freshness
    const currentItem = await prisma.gameListItem.findUnique({
      where: { listId_gameId: { listId, gameId } },
      select: { steamAchievements: true },
    });

    const cached = currentItem?.steamAchievements as {
      earned: number;
      total: number;
      percentage: number;
      lastFetched: string;
    } | null;

    if (cached?.lastFetched) {
      const age = Date.now() - new Date(cached.lastFetched).getTime();
      if (age < ACHIEVEMENT_TTL_MS) {
        logger.info(`Achievement cache hit for game ${gameId} (age: ${Math.round(age / 1000)}s)`);
        return prisma.gameListItem.findUnique({
          where: { listId_gameId: { listId, gameId } },
        });
      }
    }

    // Fetch fresh data from Steam
    logger.info(
      `Fetching achievements from Steam for appId ${mapping.steamAppId}, user ${user.steamId}`
    );
    const stats = await steamApiService.getPlayerAchievements(user.steamId, mapping.steamAppId);

    const earned = stats.filter((a) => a.achieved).length;
    const total = stats.length;
    const percentage = total > 0 ? Math.round((earned / total) * 100) : 0;

    const snapshot = {
      earned,
      total,
      percentage,
      lastFetched: new Date().toISOString(),
    };

    return listRepository.updateListItem(listId, gameId, {
      steamAchievements: snapshot,
    });
  }

  /**
   * Reorder items in a list
   */
  async reorderItems(listId: string, userId: string, data: ReorderListItemsInput) {
    const list = await listRepository.findById(listId);
    if (!list) throw new NotFoundError('List not found');
    if (list.userId !== userId) throw new ForbiddenError('You can only reorder your own lists');

    for (const item of data.items) {
      const listItem = await listRepository.findListItemById(item.id);
      if (!listItem || listItem.listId !== listId) {
        throw new NotFoundError(`List item ${item.id} not found in this list`);
      }
    }

    await listRepository.reorderItems(data.items);
    return { message: 'List reordered successfully' };
  }

  /**
   * Get lists containing a specific game
   */
  async getListsContainingGame(gameId: string) {
    const game = await gameRepository.findById(gameId);
    if (!game) throw new NotFoundError('Game not found');

    return listRepository.findListsContainingGame(gameId);
  }

  /**
   * Get popular lists
   */
  async getPopularLists(limit: number = 10) {
    return listRepository.findPopularLists(limit);
  }

  /**
   * Mark a game as completed.
   *
   * In a single transaction this method:
   *   1. Ensures the game exists in Game Gauge
   *   2. Finds the user's Completed default list
   *   3. Removes the game from Currently Playing (if present)
   *   4. Upserts the game into the Completed list with completionType + completedAt
   *   5. Optionally upserts a rating
   *   6. Optionally creates a review (skipped if one already exists)
   */
  async completeGame(userId: string, data: CompleteGameInput) {
    const { gameId, completionType, rating, review } = data;

    // Verify game exists
    const game = await gameRepository.findById(gameId);
    if (!game) throw new NotFoundError('Game not found');

    // Find the user's Completed and Currently Playing default lists
    const [completedList, playingList] = await Promise.all([
      prisma.gameList.findFirst({
        where: { userId, listType: 'completed', isDefault: true },
      }),
      prisma.gameList.findFirst({
        where: { userId, listType: 'playing', isDefault: true },
      }),
    ]);

    if (!completedList) {
      throw new NotFoundError(
        'Completed list not found. Try logging out and back in to re-provision your default lists.'
      );
    }

    // Run everything atomically
    await prisma.$transaction(async (tx) => {
      // 1. Remove from Currently Playing if present
      if (playingList) {
        await tx.gameListItem.deleteMany({
          where: { listId: playingList.id, gameId },
        });
      }

      // 2. Upsert into Completed list
      const maxOrder = await tx.gameListItem.aggregate({
        where: { listId: completedList.id },
        _max: { order: true },
      });
      const nextOrder = (maxOrder._max.order ?? -1) + 1;

      await tx.gameListItem.upsert({
        where: { listId_gameId: { listId: completedList.id, gameId } },
        create: {
          listId: completedList.id,
          gameId,
          order: nextOrder,
          completionType,
          completedAt: new Date(),
        },
        update: {
          completionType,
          completedAt: new Date(),
        },
      });
    });

    // 3. Upsert rating (outside transaction — idempotent by design)
    let savedRating = null;
    if (rating !== undefined) {
      savedRating = await ratingRepository.upsert(userId, gameId, rating);
    }

    // 4. Create review if provided and user hasn't reviewed yet
    let savedReview = null;
    if (review) {
      const existingReview = await reviewRepository.findByUserAndGame(userId, gameId);
      if (!existingReview) {
        const ratingId = savedRating?.id;
        savedReview = await reviewRepository.create({
          content: review.content,
          userId,
          gameId,
          spoilers: review.spoilers,
          ...(ratingId ? { ratingId } : {}),
        });
      }
    }

    return {
      message: 'Game marked as completed',
      completionType,
      completedListId: completedList.id,
      rating: savedRating,
      review: savedReview,
    };
  }
}

export const listService = new ListService();
