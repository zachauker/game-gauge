import { prisma } from '../config/database';
import { GameList, GameListItem, Prisma } from '@prisma/client';

export interface ListWithItems extends GameList {
  items: Array<
    GameListItem & {
      game: {
        id: string;
        title: string;
        slug: string;
        coverImage: string | null;
        releaseDate: Date | null;
      };
    }
  >;
  _count: {
    items: number;
  };
}

export interface ListWithUser extends GameList {
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
  _count: {
    items: number;
  };
}

export interface PaginatedLists {
  data: ListWithUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ListRepository {
  /**
   * Create a new list
   */
  async create(data: Prisma.GameListCreateInput): Promise<GameList> {
    return prisma.gameList.create({
      data,
    });
  }

  /**
   * Find list by ID
   */
  async findById(id: string): Promise<ListWithItems | null> {
    return prisma.gameList.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            game: {
              select: {
                id: true,
                title: true,
                slug: true,
                coverImage: true,
                releaseDate: true,
              },
            },
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
  }

  /**
   * Find lists by user ID
   */
  async findByUser(userId: string, page: number, limit: number): Promise<PaginatedLists> {
    const skip = (page - 1) * limit;

    const [lists, total] = await Promise.all([
      prisma.gameList.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      prisma.gameList.count({ where: { userId } }),
    ]);

    return {
      data: lists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find public lists (for discovery)
   */
  async findPublicLists(page: number, limit: number): Promise<PaginatedLists> {
    const skip = (page - 1) * limit;

    const [lists, total] = await Promise.all([
      prisma.gameList.findMany({
        where: { isPublic: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      prisma.gameList.count({ where: { isPublic: true } }),
    ]);

    return {
      data: lists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a list
   */
  async update(id: string, data: Prisma.GameListUpdateInput): Promise<GameList> {
    return prisma.gameList.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a list (will cascade delete items)
   */
  async delete(id: string): Promise<GameList> {
    return prisma.gameList.delete({
      where: { id },
    });
  }

  /**
   * Add game to list
   */
  async addGameToList(listId: string, gameId: string, notes?: string): Promise<GameListItem> {
    // Get the current max order value
    const maxOrder = await prisma.gameListItem.aggregate({
      where: { listId },
      _max: { order: true },
    });

    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    return prisma.gameListItem.create({
      data: {
        listId,
        gameId,
        notes,
        order: nextOrder,
      },
    });
  }

  /**
   * Remove game from list
   */
  async removeGameFromList(listId: string, gameId: string): Promise<GameListItem> {
    return prisma.gameListItem.delete({
      where: {
        listId_gameId: {
          listId,
          gameId,
        },
      },
    });
  }

  /**
   * Update list item (notes, order)
   */
  async updateListItem(
    listId: string,
    gameId: string,
    data: Prisma.GameListItemUpdateInput
  ): Promise<GameListItem> {
    return prisma.gameListItem.update({
      where: {
        listId_gameId: {
          listId,
          gameId,
        },
      },
      data,
    });
  }

  /**
   * Check if game is in list
   */
  async isGameInList(listId: string, gameId: string): Promise<boolean> {
    const count = await prisma.gameListItem.count({
      where: {
        listId,
        gameId,
      },
    });
    return count > 0;
  }

  /**
   * Reorder multiple items in a list
   */
  async reorderItems(items: Array<{ id?: string; order?: number }>): Promise<void> {
    // Use transaction to update all items atomically
    await prisma.$transaction(
      items.map((item) =>
        prisma.gameListItem.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    );
  }

  /**
   * Get list item by ID
   */
  async findListItemById(id: string): Promise<GameListItem | null> {
    return prisma.gameListItem.findUnique({
      where: { id },
    });
  }

  /**
   * Check if list exists
   */
  async exists(id: string): Promise<boolean> {
    const count = await prisma.gameList.count({
      where: { id },
    });
    return count > 0;
  }

  /**
   * Get lists containing a specific game (for "In X lists" feature)
   */
  async findListsContainingGame(gameId: string): Promise<ListWithUser[]> {
    return prisma.gameList.findMany({
      where: {
        isPublic: true,
        items: {
          some: {
            gameId,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
      take: 10, // Limit to 10 lists for performance
    });
  }

  /**
   * Get popular lists (most items)
   */
  async findPopularLists(limit: number = 10): Promise<ListWithUser[]> {
    return prisma.gameList.findMany({
      where: { isPublic: true },
      take: limit,
      orderBy: {
        items: {
          _count: 'desc',
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
  }
}

export const listRepository = new ListRepository();
