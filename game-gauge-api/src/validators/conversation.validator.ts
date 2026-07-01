import { z } from 'zod';

export const createConversationSchema = z.object({
  participantUsernames: z.array(z.string().min(1)).min(1).max(20),
  isGroup: z.boolean().default(false),
  name: z.string().min(1).max(100).optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const messageTypeSchema = z.enum([
  'TEXT',
  'GAME_SHARE',
  'LIST_SHARE',
  'REVIEW_SHARE',
  'ACTIVITY_SHARE',
]);

export const sendMessageSchema = z
  .object({
    type: messageTypeSchema.default('TEXT'),
    content: z.string().min(1).max(4000).optional(),
    entityId: z.string().uuid().optional(),
  })
  .refine((data) => (data.type === 'TEXT' ? !!data.content : !!data.entityId), {
    message: 'content is required for TEXT messages; entityId is required for share messages',
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const renameConversationSchema = z.object({
  name: z.string().min(1).max(100),
});
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;

export const messagesCursorSchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type MessagesCursorQuery = z.infer<typeof messagesCursorSchema>;
