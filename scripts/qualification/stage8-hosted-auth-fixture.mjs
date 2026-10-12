// Real VAOS login/session/logout handlers. Dedicated ephemeral hosted test only.
// No production secrets, database, or business APIs.
import {createCloudflareApp} from '../../apps/web/cloudflare-worker.mjs';
import login from '../../apps/web/api/login.mjs';
import session from '../../apps/web/api/session.mjs';
import logout from '../../apps/web/api/logout.mjs';
const handlers={'/api/login':login,'/api/session':session,'/api/logout':logout};
export default {
 async fetch(request,env){
  if(env.STAGE8_ISOLATED_ONLY!=='yes' || env.VAOS_STAGE8_EMERGENCY_DISABLE==='yes' || env.VAOS_AUTH_HARDENED_CONTROL!=='dedicated-hmac-v1')
   return new Response('qualification disabled',{status:503});
  for(const name of ['VAOS_AUTH_HARDENED_CONTROL','VAOS_SESSION_HMAC_KEY',
   'VAOS_DEV_LOGIN_PASSWORD_SHA256','VAOS_DEV_CHECKER_PASSWORD_SHA256'])process.env[name]=env[name];
  return createCloudflareApp({apiHandlers:handlers,runtimeEnv:env,
   assetFetcher:async()=>new Response('not found',{status:404})}).fetch(request);
 }
};
