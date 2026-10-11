// Isolated local workerd fixture. Never deploy this Worker remotely.
import {createCloudflareApp} from '../../apps/web/cloudflare-worker.mjs';
import login from '../../apps/web/api/login.mjs';
import session from '../../apps/web/api/session.mjs';
import logout from '../../apps/web/api/logout.mjs';
const handlers={'/api/login':login,'/api/session':session,'/api/logout':logout};
export default {
 async fetch(request,env){
  // Only synthetic credentials in local workerd; runtimeEnv and auth.mjs must agree.
  for(const key of ['VAOS_AUTH_HARDENED_CONTROL','VAOS_SESSION_HMAC_KEY',
    'VAOS_DEV_LOGIN_PASSWORD_SHA256','VAOS_DEV_CHECKER_PASSWORD_SHA256']){
   process.env[key]=env[key];
  }
  return createCloudflareApp({
    apiHandlers:handlers,runtimeEnv:env,
    assetFetcher:async()=>new Response('not found',{status:404})
  }).fetch(request);
 }
};
