import { z } from 'zod';

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

// Type exports
export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;
export type AddGameToListInput = z.infer<typeof addGameToListSchema>;
export type UpdateListItemInput = z.infer<typeof updateListItemSchema>;
export type ReorderListItemsInput = z.infer<typeof reorderListItemsSchema>;
export type GetListsQuery = z.infer<typeof getListsQuerySchema>;
