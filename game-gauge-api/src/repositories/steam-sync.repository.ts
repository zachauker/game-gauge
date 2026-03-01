import { prisma } from '../config/database';

// ──────────────────────────────────────────────
// SteamAppMapping repository
// ──────────────────────────────────────────────

class SteamMappingRepository {
  /**
   * Find mapping by Steam AppID
   */
  async findBySteamAppId(steamAppId: number) {
    return prisma.steamAppMapping.findUnique({
      where: { steamAppId },
    });
  }

  /**
   * Find mappings for multiple Steam AppIDs (batch)
   */
  async findManyBySteamAppIds(steamAppIds: number[]) {
    return prisma.steamAppMapping.findMany({
      where: { steamAppId: { in: steamAppIds } },
    });
  }

  /**
   * Create or update a mapping
   */
  async upsert(data: {
    steamAppId: number;
    igdbId?: number | null;
    gameId?: string | null;
    gameName: string;
    matched: boolean;
  }) {
    return prisma.steamAppMapping.upsert({
      where: { steamAppId: data.steamAppId },
      create: {
        ...data,
        lastChecked: new Date(),
      },
      update: {
        ...data,
        lastChecked: new Date(),
      },
    });
  }

  /**
   * Bulk upsert mappings (used during batch IGDB lookups)
   */
  async upsertMany(
    mappings: Array<{
      steamAppId: number;
      igdbId?: number | null;
      gameId?: string | null;
      gameName: string;
      matched: boolean;
    }>
  ) {
    // Prisma doesn't support bulk upsert natively, use transaction
    return prisma.$transaction(
      mappings.map((m) =>
        prisma.steamAppMapping.upsert({
          where: { steamAppId: m.steamAppId },
          create: { ...m, lastChecked: new Date() },
          update: { ...m, lastChecked: new Date() },
        })
      )
    );
  }

  /**
   * Get unmapped entries that haven't been checked recently
   * (for background re-checking of previously unmatched games)
   */
  async findStaleUnmatched(olderThan: Date, limit: number = 100) {
    return prisma.steamAppMapping.findMany({
      where: {
        matched: false,
        lastChecked: { lt: olderThan },
      },
      take: limit,
      orderBy: { lastChecked: 'asc' },
    });
  }
}

// ──────────────────────────────────────────────
// SteamLibrarySync repository
// ──────────────────────────────────────────────

class SteamLibrarySyncRepository {
  /**
   * Upsert a library entry for a user
   */
  async upsert(data: {
    userId: string;
    steamAppId: number;
    gameId?: string | null;
    name: string;
    playtimeForever: number;
    playtimeRecent: number;
    iconUrl?: string | null;
    lastPlayed?: Date | null;
  }) {
    return prisma.steamLibrarySync.upsert({
      where: {
        userId_steamAppId: {
          userId: data.userId,
          steamAppId: data.steamAppId,
        },
      },
      create: {
        ...data,
        lastSynced: new Date(),
      },
      update: {
        gameId: data.gameId,
        name: data.name,
        playtimeForever: data.playtimeForever,
        playtimeRecent: data.playtimeRecent,
        iconUrl: data.iconUrl,
        lastPlayed: data.lastPlayed,
        lastSynced: new Date(),
      },
    });
  }

  /**
   * Bulk upsert library entries (used during full sync)
   */
  async upsertMany(
    entries: Array<{
      userId: string;
      steamAppId: number;
      gameId?: string | null;
      name: string;
      playtimeForever: number;
      playtimeRecent: number;
      iconUrl?: string | null;
      lastPlayed?: Date | null;
    }>
  ) {
    // Process in chunks to avoid overwhelming the DB
    const CHUNK_SIZE = 50;
    const results = [];

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const chunkResults = await prisma.$transaction(
        chunk.map((entry) =>
          prisma.steamLibrarySync.upsert({
            where: {
              userId_steamAppId: {
                userId: entry.userId,
                steamAppId: entry.steamAppId,
              },
            },
            create: { ...entry, lastSynced: new Date() },
            update: {
              gameId: entry.gameId,
              name: entry.name,
              playtimeForever: entry.playtimeForever,
              playtimeRecent: entry.playtimeRecent,
              iconUrl: entry.iconUrl,
              lastPlayed: entry.lastPlayed,
              lastSynced: new Date(),
            },
          })
        )
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Get user's full library (with optional game data)
   */
  async getUserLibrary(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: 'playtimeForever' | 'playtimeRecent' | 'name' | 'lastPlayed';
      sortOrder?: 'asc' | 'desc';
      matchedOnly?: boolean;
    } = {}
  ) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'playtimeForever',
      sortOrder = 'desc',
      matchedOnly = false,
    } = options;

    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (matchedOnly) {
      where.gameId = { not: null };
    }

    const [entries, total] = await Promise.all([
      prisma.steamLibrarySync.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          game: {
            select: {
              id: true,
              title: true,
              slug: true,
              coverImage: true,
              igdbId: true,
              genres: true,
            },
          },
        },
      }),
      prisma.steamLibrarySync.count({ where }),
    ]);

    return {
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get recently played games (playtime_recent > 0)
   */
  async getRecentlyPlayed(userId: string, limit: number = 20) {
    return prisma.steamLibrarySync.findMany({
      where: {
        userId,
        playtimeRecent: { gt: 0 },
      },
      take: limit,
      orderBy: { playtimeRecent: 'desc' },
      include: {
        game: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverImage: true,
            igdbId: true,
          },
        },
      },
    });
  }

  /**
   * Get sync metadata for a user (last sync time, game counts)
   */
  async getSyncStatus(userId: string) {
    const [totalGames, matchedGames, lastEntry] = await Promise.all([
      prisma.steamLibrarySync.count({ where: { userId } }),
      prisma.steamLibrarySync.count({
        where: { userId, gameId: { not: null } },
      }),
      prisma.steamLibrarySync.findFirst({
        where: { userId },
        orderBy: { lastSynced: 'desc' },
        select: { lastSynced: true },
      }),
    ]);

    return {
      totalGames,
      matchedGames,
      unmatchedGames: totalGames - matchedGames,
      lastSynced: lastEntry?.lastSynced ?? null,
    };
  }

  /**
   * Remove stale library entries for games the user no longer owns
   * (i.e. entries not touched by the current sync)
   */
  async removeStaleEntries(userId: string, currentSteamAppIds: number[]) {
    if (currentSteamAppIds.length === 0) return { count: 0 };

    return prisma.steamLibrarySync.deleteMany({
      where: {
        userId,
        steamAppId: { notIn: currentSteamAppIds },
      },
    });
  }
}

export const steamMappingRepository = new SteamMappingRepository();
export const steamLibrarySyncRepository = new SteamLibrarySyncRepository();
