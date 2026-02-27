import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import { env } from './env';

passport.use(
  new SteamStrategy(
    {
      returnURL: env.STEAM_RETURN_URL,
      realm: env.STEAM_REALM,
      apiKey: env.STEAM_API_KEY,
    },
    (_identifier: string, profile: any, done: any) => {
      // We don't do DB lookup here — just pass the profile through.
      // The actual user creation/lookup happens in the controller/service.
      const steamProfile = {
        steamId: profile.id,
        username: profile.displayName,
        avatar: profile.photos?.[2]?.value || profile.photos?.[0]?.value || '',
        profileUrl: profile._json?.profileurl || '',
      };
      return done(null, steamProfile);
    }
  )
);

export default passport;
