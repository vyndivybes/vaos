import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('isolated qualification fixture has a fail-closed emergency stop',async()=>{
 const fixture=await readFile(new URL('./stage8-hosted-auth-fixture.mjs',import.meta.url),'utf8');
 assert.match(fixture,/STAGE8_ISOLATED_ONLY/);
 assert.match(fixture,/VAOS_STAGE8_EMERGENCY_DISABLE/);
 assert.match(fixture,/status:503/);
});
test('production cutover requires independent rollback qualification',async()=>{
 const source=await readFile(new URL('../../apps/web/lib/stage8-cutover-approval.mjs',import.meta.url),'utf8');
 assert.match(source,/rollbackQualified/);
 assert.match(source,/emergencyDisableQualified/);
 assert.match(source,/businessWritesAllowed/);
});
