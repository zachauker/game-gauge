import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', conversationController.getInbox.bind(conversationController));
router.get('/requests', conversationController.getRequests.bind(conversationController));
router.get('/unread-count', conversationController.getUnreadCount.bind(conversationController));
router.post('/', conversationController.create.bind(conversationController));
router.get('/:id', conversationController.getById.bind(conversationController));
router.patch('/:id', conversationController.rename.bind(conversationController));
router.delete('/:id', conversationController.archiveOrLeave.bind(conversationController));
router.post('/:id/accept', conversationController.accept.bind(conversationController));
router.post('/:id/decline', conversationController.decline.bind(conversationController));
router.post(
  '/:id/members/:username',
  conversationController.addMember.bind(conversationController)
);
router.delete(
  '/:id/members/:userId',
  conversationController.removeMember.bind(conversationController)
);
router.get('/:id/messages', conversationController.getMessages.bind(conversationController));
router.post('/:id/messages', conversationController.sendMessage.bind(conversationController));
router.patch(
  '/:id/messages/:messageId',
  conversationController.editMessage.bind(conversationController)
);
router.delete(
  '/:id/messages/:messageId',
  conversationController.deleteMessage.bind(conversationController)
);

export default router;
