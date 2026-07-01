import { Request, Response, NextFunction } from 'express';
import { blockService } from '../services/block.service';

export class BlockController {
  async block(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await blockService.blockUser(req.user.userId, req.params.username);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async unblock(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const result = await blockService.unblockUser(req.user.userId, req.params.username);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async listBlocked(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const blocked = await blockService.getBlockedUsers(req.user.userId);
      res.status(200).json({ success: true, data: blocked });
    } catch (error) {
      next(error);
    }
  }
}

export const blockController = new BlockController();
