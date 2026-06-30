import { z } from 'zod';

// Base game schema for creation
export const createGameSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters'),
  description: z
    .string()
    .max(5000, 'Description must be less than 5000 characters')
    .optional(),
  releaseDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  developer: z
    .string()
    .max(100, 'Developer name must be less than 100 characters')
    .optional(),
  publisher: z
    .string()
    .max(100, 'Publisher name must be less than 100 characters')
    .optional(),
  genres: z
    .array(z.string())
    .max(10, 'Maximum 10 genres allowed')
    .optional()
    .default([]),
  platforms: z
    .array(z.string())
    .max(20, 'Maximum 20 platforms allowed')
    .optional()
    .default([]),
  coverImage: z
    .string()
    .url('Cover image must be a valid URL')
    .optional(),
  igdbId: z
    .number()
    .int()
    .positive()
    .optional(),
  metacritic: z
    .number()
    .int()
    .min(0, 'Metacritic score must be between 0 and 100')
    .max(100, 'Metacritic score must be between 0 and 100')
    .optional(),
});

// Update schema - all fields optional
export const updateGameSchema = z.object({
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title must be less than 200 characters')
    .optional(),
  description: z
    .string()
    .max(5000, 'Description must be less than 5000 characters')
    .optional(),
  releaseDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  developer: z
    .string()
    .max(100, 'Developer name must be less than 100 characters')
    .optional(),
  publisher: z
    .string()
    .max(100, 'Publisher name must be less than 100 characters')
    .optional(),
  genres: z
    .array(z.string())
    .max(10, 'Maximum 10 genres allowed')
    .optional(),
  platforms: z
    .array(z.string())
    .max(20, 'Maximum 20 platforms allowed')
    .optional(),
  coverImage: z
    .string()
    .url('Cover image must be a valid URL')
    .optional(),
  igdbId: z
    .number()
    .int()
    .positive()
    .optional(),
  metacritic: z
    .number()
    .int()
    .min(0, 'Metacritic score must be between 0 and 100')
    .max(100, 'Metacritic score must be between 0 and 100')
    .optional(),
});

// Query parameters for listing games
export const listGamesQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  search: z
    .string()
    .max(100, 'Search query must be less than 100 characters')
    .optional(),
  genre: z
    .string()
    .max(50, 'Genre filter must be less than 50 characters')
    .optional(),
  platform: z
    .string()
    .max(50, 'Platform filter must be less than 50 characters')
    .optional(),
  sortBy: z
    .enum(['title', 'releaseDate', 'createdAt', 'metacritic', 'averageRating'])
    .optional()
    .default('createdAt'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc'),
});

// Type exports for use in other files
export type CreateGameInput = z.infer<typeof createGameSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;
export type ListGamesQuery = z.infer<typeof listGamesQuerySchema>;
