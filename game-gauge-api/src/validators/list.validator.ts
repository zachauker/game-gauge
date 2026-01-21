import { z } from 'zod';

/**
 * Schema for creating a list
 */
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
  isPublic: z
    .boolean()
    .default(true),
});

/**
 * Schema for updating a list
 */
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
  isPublic: z
    .boolean()
    .optional(),
});

/**
 * Schema for adding a game to a list
 */
export const addGameToListSchema = z.object({
  gameId: z
    .string()
    .uuid('Invalid game ID'),
  notes: z
    .string()
    .max(500, 'Notes must be less than 500 characters')
    .trim()
    .optional(),
});

/**
 * Schema for updating a list item
 */
export const updateListItemSchema = z.object({
  notes: z
    .string()
    .max(500, 'Notes must be less than 500 characters')
    .trim()
    .optional(),
  order: z
    .number()
    .int()
    .min(0)
    .optional(),
});

/**
 * Schema for reordering list items
 */
export const reorderListItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      order: z.number().int().min(0),
    })
  ).min(1, 'At least one item is required'),
});

/**
 * Query parameters for getting lists
 */
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
  userId: z
    .string()
    .uuid()
    .optional(),
});

// Type exports
export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;
export type AddGameToListInput = z.infer<typeof addGameToListSchema>;
export type UpdateListItemInput = z.infer<typeof updateListItemSchema>;
export type ReorderListItemsInput = z.infer<typeof reorderListItemsSchema>;
export type GetListsQuery = z.infer<typeof getListsQuerySchema>;
