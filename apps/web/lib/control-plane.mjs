import { parseCookies, SESSION_COOKIE, verifySessionToken } from './auth.mjs';
import { buildWorkspaceModel } from './workspace-model.mjs';
import { getDurableControlService } from './durable-control-provider.mjs';

export async function getControlPlanePayload(cookieHeader = '', service = null, runtimeEnv = undefined) {
  const session = verifySessionToken(parseCookies(cookieHeader)[SESSION_COOKIE]);
  if (!session) return null;

  const controlService = service || getDurableControlService(runtimeEnv);
  const runtimeSnapshot = await controlService.snapshot();
  return {
    session: { email: session.email },
    model: buildWorkspaceModel(runtimeSnapshot),
  };
}
