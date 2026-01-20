import { Request, Response, NextFunction } from 'express';
import { gameService } from '../services/game.service';
import {
  createGameSchema,
  updateGameSchema,
  listGamesQuerySchema,
} from '../validators/game.validator';

export class GameController {
  /**
   * Create a new game
   * POST /api/games
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createGameSchema.parse(req.body);
      const game = await gameService.create(data);

      res.status(201).json({
        success: true,
        data: game,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all games with pagination, search, and filters
   * GET /api/games?page=1&limit=20&search=zelda&genre=RPG&platform=Switch&sortBy=title&sortOrder=asc
   */
  async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listGamesQuerySchema.parse(req.query);
      const result = await gameService.findAll(query);

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
   * Get a single game by ID
   * GET /api/games/:id
   */
  async findById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const game = await gameService.findById(id);

      res.status(200).json({
        success: true,
        data: game,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single game by slug (SEO-friendly)
   * GET /api/games/slug/:slug
   */
  async findBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;
      const game = await gameService.findBySlug(slug);

      res.status(200).json({
        success: true,
        data: game,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a game
   * PATCH /api/games/:id
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = updateGameSchema.parse(req.body);
      const game = await gameService.update(id, data);

      res.status(200).json({
        success: true,
        data: game,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a game
   * DELETE /api/games/:id
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await gameService.delete(id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get top-rated games
   * GET /api/games/top-rated?limit=10
   */
  async getTopRated(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const games = await gameService.getTopRated(limit);

      res.status(200).json({
        success: true,
        data: games,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recently added games
   * GET /api/games/recent?limit=10
   */
  async getRecent(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const games = await gameService.getRecent(limit);

      res.status(200).json({
        success: true,
        data: games,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const gameController = new GameController();
