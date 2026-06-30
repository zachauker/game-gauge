import { z } from 'zod';
export const COMPLETION_TYPES = ['beaten', '100pct', 'abandoned', 'endless'] as const;
export type CompletionType = (typeof COMPLETION_TYPES)[number];

export const LIST_SORT_BY = ['custom', 'title', 'dateAdded', 'progress', 'releaseDate', 'rating'] as const;
export type ListSortBy = (typeof LIST_SORT_BY)[number];

export const LIST_SORT_DIR = ['asc', 'desc'] as const;
export type ListSortDir = (typeof LIST_SORT_DIR)[number];

export const createListSchema = z.object({
  name: z
    .string()
    .min(1, 'List name is required')
    .max(100, 'List name must be less than 100 characters')
    .trim(),
  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .trim()
    .optional(),
  isPublic: z.boolean().default(true),
});

export const updateListSchema = z.object({
  name: z
    .string()
    .min(1, 'List name cannot be empty')
    .max(100, 'List name must be less than 100 characters')
    .trim()
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .trim()
    .optional(),
  isPublic: z.boolean().optional(),
  sortBy: z
    .enum(LIST_SORT_BY, {
      errorMap: () => ({
        message: `sortBy must be one of: ${LIST_SORT_BY.join(', ')}`,
      }),
    })
    .optional(),
  sortDir: z
    .enum(LIST_SORT_DIR, {
      errorMap: () => ({ message: 'sortDir must be "asc" or "desc"' }),
    })
    .optional(),
});

export const addGameToListSchema = z.object({
  gameId: z.string().uuid('Invalid game ID'),
  notes: z.string().max(500, 'Notes must be less than 500 characters').trim().optional(),
});

/**
 * Update a list item — notes, order, and progress tracking fields.
 * progressPct is only meaningful for Currently Playing items but is
 * accepted on any list item; enforcement is at the service layer.
 */
export const updateListItemSchema = z.object({
  notes: z.string().max(500, 'Notes must be less than 500 characters').trim().optional(),
  order: z.number().int().min(0).optional(),

  // Progress tracking
  progressPct: z
    .number()
    .int('Progress must be a whole number')
    .min(0, 'Progress cannot be less than 0')
    .max(100, 'Progress cannot exceed 100')
    .optional(),
  progressNote: z
    .string()
    .max(300, 'Progress note must be less than 300 characters')
    .trim()
    .optional(),
});

export const reorderListItemsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        order: z.number().int().min(0),
      })
    )
    .min(1, 'At least one item is required'),
});

export const getListsQuerySchema = z.object({
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
  userId: z.string().uuid().optional(),
});

export const completeGameSchema = z.object({
  gameId: z.string().uuid('Invalid game ID'),

  completionType: z.enum(COMPLETION_TYPES, {
    errorMap: () => ({
      message: 'completionType must be one of: beaten, 100pct, abandoned, endless',
    }),
  }),

  // Optional rating (1–10)
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1')
    .max(10, 'Rating must be at most 10')
    .optional(),

  // Optional review
  review: z
    .object({
      content: z
        .string()
        .min(10, 'Review must be at least 10 characters')
        .max(5000, 'Review must be less than 5000 characters')
        .trim(),
      spoilers: z.boolean().default(false),
    })
    .optional(),
});

// Type exports
export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;
export type AddGameToListInput = z.infer<typeof addGameToListSchema>;
export type UpdateListItemInput = z.infer<typeof updateListItemSchema>;
export type ReorderListItemsInput = z.infer<typeof reorderListItemsSchema>;
export type GetListsQuery = z.infer<typeof getListsQuerySchema>;
export type CompleteGameInput = z.infer<typeof completeGameSchema>;
