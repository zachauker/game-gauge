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
      const game = await gameService.findById(id as string);

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
      const game = await gameService.findBySlug(slug as string);

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
      const game = await gameService.update(id as string, data);

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
      const result = await gameService.delete(id as string);

      res.status(200).json({
        success: true,
        data: result,
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

  /**
   * Get top rated games
   * GET /api/games/top-rated?limit=20
   */
  async getTopRated(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
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
   * Get trending games
   * GET /api/games/trending?days=7&limit=20
   */
  async getTrending(req: Request, res: Response, next: NextFunction) {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const games = await gameService.getTrending(days, limit);

      res.status(200).json({
        success: true,
        data: games,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recently reviewed games
   * GET /api/games/recently-reviewed?limit=20
   */
  async getRecentlyReviewed(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const games = await gameService.getRecentlyReviewed(limit);

      res.status(200).json({
        success: true,
        data: games,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all genres
   * GET /api/games/genres
   */
  async getGenres(_req: Request, res: Response, next: NextFunction) {
    try {
      const genres = await gameService.getAllGenres();

      res.status(200).json({
        success: true,
        data: genres,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all platforms
   * GET /api/games/platforms
   */
  async getPlatforms(_req: Request, res: Response, next: NextFunction) {
    try {
      const platforms = await gameService.getAllPlatforms();

      res.status(200).json({
        success: true,
        data: platforms,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get games by genre
   * GET /api/games/genre/:genre?page=1&limit=20&sortBy=createdAt&sortOrder=desc
   */
  async getByGenre(req: Request, res: Response, next: NextFunction) {
    try {
      const { genre } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const sortBy = (req.query.sortBy as string) || 'createdAt';
      const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

      const result = await gameService.findByGenre(genre, {
        page,
        limit,
        sortBy,
        sortOrder,
      });

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const gameController = new GameController();
