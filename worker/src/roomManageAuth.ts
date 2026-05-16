import type { Env, Room } from './types';
import { validateHostToken } from './db';
import { verifyAdminSiteSession } from './adminSession';

/** Room moderator: legacy host_token header, or logged-in site admin session cookie */
export async function authorizeRoomManage(
  env: Env,
  room: Room,
  hostToken: string | null | undefined,
  cookieHeader: string | undefined
): Promise<boolean> {
  if (validateHostToken(room, hostToken)) return true;
  return verifyAdminSiteSession(env, cookieHeader);
}
