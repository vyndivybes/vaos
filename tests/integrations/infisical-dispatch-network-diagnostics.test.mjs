import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchInfisicalWatchdog, infisicalDispatchFailureCode} from '../../platform/execution/cloudflare-infisical-dispatch.mjs';

for (const [name, error, expected] of [
  ['dns', Object.assign(new Error('secret'), {cause:{code:'ENOTFOUND'}}), 'ENOTFOUND'],
  ['timeout', Object.assign(new Error('secret'), {name:'TimeoutError'}), 'TIMEOUT'],
  ['unknown', new Error('token secret inside'), 'UNKNOWN'],
]) {
  test('watchdog redacts '+name+' transport failure', async () => {
    await assert.rejects(
      dispatchInfisicalWatchdog({token:'not-a-real-token',fetchImpl:async()=>{throw error;}}),
      e => e.message === 'VAOS_GITHUB_DISPATCH_NETWORK_FAILED_'+expected &&
        infisicalDispatchFailureCode(e) === e.message &&
        !e.message.includes('secret'),
    );
  });
}
test('watchdog performs no action when unconfigured', async()=>{
  assert.deepEqual(await dispatchInfisicalWatchdog({token:'',fetchImpl:async()=>{throw Error('should not call');}}),{status:'unconfigured'});
});
