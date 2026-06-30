import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, notificationController.getNotifications.bind(notificationController));
router.get('/unread-count', authenticate, notificationController.getUnreadCount.bind(notificationController));
router.patch('/read-all', authenticate, notificationController.markAllRead.bind(notificationController));
router.patch('/:id/read', authenticate, notificationController.markRead.bind(notificationController));

export default router;
