import { Router, Request, Response, NextFunction } from 'express';
import passport from '../config/passport';
import { steamAuthService } from '../services/steam-auth.service';
import { authenticate } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { logger } from '../utils/logger.util';

const router = Router();

/**
 * @route   GET /api/auth/steam
 * @desc    Redirect user to Steam login page
 * @access  Public
 * @query   linkMode=true — if present, indicates user is linking (not signing in)
 */
router.get('/steam', (req: Request, _res: Response, next: NextFunction) => {
  // Store linkMode and userId in session-like state via the return URL
  // We'll encode it in the state parameter
  const linkMode = req.query.linkMode === 'true';
  const returnUrl =
    linkMode && req.query.token
      ? `${env.STEAM_RETURN_URL}?linkMode=true&token=${req.query.token}`
      : env.STEAM_RETURN_URL;

  // @ts-expect-error - Passport expects a response object
  passport.authenticate('steam', {
    session: false,
    returnURL: returnUrl,
  })(req, _res, next);
});

/**
 * @route   GET /api/auth/steam/callback
 * @desc    Steam redirects here after authentication
 * @access  Public
 */
router.get(
  '/steam/callback',
  passport.authenticate('steam', {
    session: false,
    failureRedirect: `${env.FRONTEND_STEAM_CALLBACK_URL}?error=steam_auth_failed`,
  }),
  async (req: Request, res: Response) => {
    try {
      const steamProfile = req.user as any;
      const linkMode = req.query.linkMode === 'true';
      const existingToken = req.query.token as string | undefined;

      if (linkMode && existingToken) {
        // User is linking Steam to their existing account
        // Verify their JWT to get userId
        const { verifyToken } = await import('../utils/jwt.util');
        const payload = verifyToken(existingToken);

        await steamAuthService.linkSteamAccount(payload.userId, steamProfile);

        return res.redirect(`${env.FRONTEND_STEAM_CALLBACK_URL}?linked=true`);
      }

      // Normal sign-in/sign-up flow
      const result = await steamAuthService.findOrCreateUser(steamProfile);

      // Redirect to frontend with token
      const params = new URLSearchParams({
        token: result.token,
        isNewUser: String(result.isNewUser),
      });

      return res.redirect(`${env.FRONTEND_STEAM_CALLBACK_URL}?${params.toString()}`);
    } catch (error: any) {
      logger.error('Steam callback error:', error);
      return res.redirect(
        `${env.FRONTEND_STEAM_CALLBACK_URL}?error=${encodeURIComponent(error.message)}`
      );
    }
  }
);

/**
 * @route   DELETE /api/auth/steam/unlink
 * @desc    Unlink Steam account from current user
 * @access  Private
 */
router.delete('/steam/unlink', authenticate, async (req: Request, res: Response, next) => {
  try {
    const user = await steamAuthService.unlinkSteamAccount(req.user!.userId);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

export default router;
