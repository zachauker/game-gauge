import { Request, Response, NextFunction } from 'express';
import { listService } from '../services/list.service';
import {
  createListSchema,
  updateListSchema,
  addGameToListSchema,
  updateListItemSchema,
  reorderListItemsSchema,
  getListsQuerySchema,
} from '../validators/list.validator';

export class ListController {
  /**
   * Create a new list
   * POST /api/lists
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');

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
      const { id } = req.params;
      const list = await listService.findById(id, req.user?.userId);

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
    try {
      if (!req.user) throw new Error('User not authenticated');

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
    try {
      if (!req.user) throw new Error('User not authenticated');

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
      const { userId } = req.params;
      const query = getListsQuerySchema.parse(req.query);
      const result = await listService.getUserLists(userId, query, req.user?.userId);

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
  async getPopularLists(req: Request, res: Response, next: NextFunction) {
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
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { id } = req.params;
      const data = updateListSchema.parse(req.body);
      const list = await listService.update(id, req.user.userId, data);

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
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { id } = req.params;
      const result = await listService.delete(id, req.user.userId);

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
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { id } = req.params;
      const data = addGameToListSchema.parse(req.body);
      const listItem = await listService.addGameToList(id, req.user.userId, data);

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
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { id, gameId } = req.params;
      const result = await listService.removeGameFromList(id, gameId, req.user.userId);

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
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { id, gameId } = req.params;
      const data = updateListItemSchema.parse(req.body);
      const listItem = await listService.updateListItem(id, gameId, req.user.userId, data);

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
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { id, gameId } = req.params;
      const listItem = await listService.syncAchievements(id, gameId, req.user.userId);

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
    try {
      if (!req.user) throw new Error('User not authenticated');

      const { id } = req.params;
      const data = reorderListItemsSchema.parse(req.body);
      const result = await listService.reorderItems(id, req.user.userId, data);

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
      const { gameId } = req.params;
      const lists = await listService.getListsContainingGame(gameId);

      res.status(200).json({ success: true, data: lists });
    } catch (error) {
      next(error);
    }
  }
}

export const listController = new ListController();
