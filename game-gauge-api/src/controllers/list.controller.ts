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
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const data = createListSchema.parse(req.body);
      const list = await listService.create(req.user.userId, data);

      res.status(201).json({
        success: true,
        data: list,
      });
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
      const requestingUserId = req.user?.userId;

      const list = await listService.findById(id as string, requestingUserId);

      res.status(200).json({
        success: true,
        data: list,
      });
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
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const query = getListsQuerySchema.parse(req.query);
      const result = await listService.getUserLists(
        req.user.userId,
        query,
        req.user.userId
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
   * Get all lists by a specific user
   * GET /api/lists/user/:userId
   */
  async getUserLists(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const query = getListsQuerySchema.parse(req.query);
      const requestingUserId = req.user?.userId;

      const result = await listService.getUserLists(
        userId as string,
        query,
        requestingUserId
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
  async getPopularLists(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const lists = await listService.getPopularLists(limit);

      res.status(200).json({
        success: true,
        data: lists,
      });
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
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { id } = req.params;
      const data = updateListSchema.parse(req.body);

      const list = await listService.update(id as string, req.user.userId, data);

      res.status(200).json({
        success: true,
        data: list,
      });
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
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { id } = req.params;
      const result = await listService.delete(id as string, req.user.userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add game to list
   * POST /api/lists/:id/games
   */
  async addGame(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { id } = req.params;
      const data = addGameToListSchema.parse(req.body);

      const listItem = await listService.addGameToList(
        id as string,
        req.user.userId,
        data
      );

      res.status(201).json({
        success: true,
        data: listItem,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove game from list
   * DELETE /api/lists/:id/games/:gameId
   */
  async removeGame(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { id, gameId } = req.params;
      const result = await listService.removeGameFromList(
        id as string,
        gameId as string,
        req.user.userId
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update list item (notes, order)
   * PATCH /api/lists/:id/games/:gameId
   */
  async updateListItem(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { id, gameId } = req.params;
      const data = updateListItemSchema.parse(req.body);

      const listItem = await listService.updateListItem(
        id as string,
        gameId as string,
        req.user.userId,
        data
      );

      res.status(200).json({
        success: true,
        data: listItem,
      });
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
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const { id } = req.params;
      const data = reorderListItemsSchema.parse(req.body);

      const result = await listService.reorderItems(
        id as string,
        req.user.userId,
        data
      );

      res.status(200).json({
        success: true,
        data: result,
      });
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
      const lists = await listService.getListsContainingGame(gameId as string);

      res.status(200).json({
        success: true,
        data: lists,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const listController = new ListController();
