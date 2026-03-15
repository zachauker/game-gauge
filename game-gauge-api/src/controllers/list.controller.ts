import { Request, Response, NextFunction } from 'express';
import { listService } from '../services/list.service';
import {
  createListSchema,
  updateListSchema,
  addGameToListSchema,
  updateListItemSchema,
  reorderListItemsSchema,
  getListsQuerySchema,
  completeGameSchema,
} from '../validators/list.validator';
/** req.params values are always strings in Express — this just satisfies TS */
const param = (v: string | string[]): string => (Array.isArray(v) ? v[0] : v);

export class ListController {
  /**
   * Create a new list
   * POST /api/lists
   */
  async create(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const data = createListSchema.parse(req.body);
      const list = await listService.create(req.user.userId, data);

      res.status(201).json({ success: true, data: list });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single list by ID
   * GET /api/lists/:id
   */
  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const list = await listService.findById(param(req.params.id), req.user?.userId);

      res.status(200).json({ success: true, data: list });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the three default list IDs for the current user
   * GET /api/lists/defaults
   */
  async getDefaults(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const defaults = await listService.getDefaultLists(req.user.userId);
      res.status(200).json({ success: true, data: defaults });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all lists by current user
   * GET /api/lists/me
   */
  async getMyLists(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const query = getListsQuerySchema.parse(req.query);
      const result = await listService.getUserLists(req.user.userId, query, req.user.userId);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all lists by a specific user
   * GET /api/lists/user/:userId
   */
  async getUserLists(req: Request, res: Response, next: NextFunction) {
    try {
      const query = getListsQuerySchema.parse(req.query);
      const result = await listService.getUserLists(
        param(req.params.userId),
        query,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get public lists (discovery)
   * GET /api/lists/public
   */
  async getPublicLists(req: Request, res: Response, next: NextFunction) {
    try {
      const query = getListsQuerySchema.parse(req.query);
      const result = await listService.getPublicLists(query);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get popular lists
   * GET /api/lists/popular
   */
  async getPopularLists(_req: Request, res: Response, next: NextFunction) {
    try {
      const lists = await listService.getPopularLists();
      res.status(200).json({ success: true, data: lists });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a list
   * PATCH /api/lists/:id
   */
  async update(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const data = updateListSchema.parse(req.body);
      const list = await listService.update(param(req.params.id), req.user.userId, data);

      res.status(200).json({ success: true, data: list });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a list
   * DELETE /api/lists/:id
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const result = await listService.delete(param(req.params.id), req.user.userId);

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add a game to a list
   * POST /api/lists/:id/games
   */
  async addGame(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const data = addGameToListSchema.parse(req.body);
      const listItem = await listService.addGameToList(param(req.params.id), req.user.userId, data);

      res.status(201).json({ success: true, data: listItem });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove a game from a list
   * DELETE /api/lists/:id/games/:gameId
   */
  async removeGame(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const result = await listService.removeGameFromList(
        param(req.params.id),
        param(req.params.gameId),
        req.user.userId
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a list item — notes, order, progressPct, progressNote
   * PATCH /api/lists/:id/games/:gameId
   */
  async updateListItem(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const data = updateListItemSchema.parse(req.body);
      const listItem = await listService.updateListItem(
        param(req.params.id),
        param(req.params.gameId),
        req.user.userId,
        data
      );

      res.status(200).json({ success: true, data: listItem });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sync Steam achievements for a game in the Currently Playing list
   * POST /api/lists/:id/games/:gameId/sync-achievements
   */
  async syncAchievements(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const listItem = await listService.syncAchievements(
        param(req.params.id),
        param(req.params.gameId),
        req.user.userId
      );

      res.status(200).json({ success: true, data: listItem });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reorder items in a list
   * POST /api/lists/:id/reorder
   */
  async reorderItems(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const data = reorderListItemsSchema.parse(req.body);
      const result = await listService.reorderItems(param(req.params.id), req.user.userId, data);

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get lists containing a specific game
   * GET /api/games/:gameId/lists
   */
  async getListsContainingGame(req: Request, res: Response, next: NextFunction) {
    try {
      const lists = await listService.getListsContainingGame(param(req.params.gameId));

      res.status(200).json({ success: true, data: lists });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark a game as completed
   * POST /api/lists/completed/add
   */
  async completeGame(req: Request, res: Response, next: NextFunction) {
    if (!req.user) throw new Error('User not authenticated');
    try {
      const data = completeGameSchema.parse(req.body);
      const result = await listService.completeGame(req.user.userId, data);

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const listController = new ListController();
