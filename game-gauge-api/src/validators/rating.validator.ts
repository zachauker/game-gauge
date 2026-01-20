import { z } from 'zod';

/**
 * Schema for creating or updating a rating
 * Users can rate games on a scale of 1-10
 */
export const ratingSchema = z.object({
  score: z
    .number()
    .int('Score must be an integer')
    .min(1, 'Score must be at least 1')
    .max(10, 'Score must be at most 10'),
});

/**
 * Query parameters for getting ratings
 */
export const getRatingsQuerySchema = z.object({
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
});

// Type exports
export type RatingInput = z.infer<typeof ratingSchema>;
export type GetRatingsQuery = z.infer<typeof getRatingsQuerySchema>;
