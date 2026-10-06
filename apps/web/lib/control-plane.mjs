import { parseCookies, SESSION_COOKIE, verifySessionToken } from './auth.mjs';
import { buildWorkspaceModel } from './workspace-model.mjs';

export function getControlPlanePayload(cookieHeader = '') {
  const session = verifySessionToken(parseCookies(cookieHeader)[SESSION_COOKIE]);
  if (!session) return null;
  return { session: { email: session.email }, model: buildWorkspaceModel() };
}
