import { parseCookies, SESSION_COOKIE, verifySessionToken } from './auth.mjs';
import { buildWorkspaceModel } from './workspace-model.mjs';
import { getDevelopmentRuntime } from './runtime-provider.mjs';

export function getControlPlanePayload(cookieHeader = '') {
  const session = verifySessionToken(parseCookies(cookieHeader)[SESSION_COOKIE]);
  if (!session) return null;

  const runtimeSnapshot = getDevelopmentRuntime().snapshot();
  return {
    session: { email: session.email },
    model: buildWorkspaceModel(runtimeSnapshot),
  };
}
