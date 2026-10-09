import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLoginReturn} from './login-return.mjs';

test('maker sign-in returns to specifically approved Activepieces recovery page',()=>{
 assert.equal(resolveLoginReturn('?next=%2Fapi%2Factivepieces-mcp%2Fcode-recovery','shyamsundhar1982@gmail.com'),
   '/api/activepieces-mcp/code-recovery');
});
test('checker cannot be sent to maker-only recovery page',()=>{
 assert.equal(resolveLoginReturn('?next=%2Fapi%2Factivepieces-mcp%2Fcode-recovery','kaaviyam1519@gmail.com'),'/workspace');
});
test('arbitrary, cross-origin, encoded URLs and protocol-relative return targets fail closed',()=>{
 for(const query of ['?next=https%3A%2F%2Fevil.example','?next=%2F%2Fevil.example',
  '?next=%2Fapi%2Fother','?next=%2Fapi%2Factivepieces-mcp%2Fcode-recovery%3Fanything%3D1',
  '?next=%2Fapi%2Factivepieces-mcp%2Fcode-recovery&next=%2Fworkspace','?next=%5C%5Cevil']) {
  assert.equal(resolveLoginReturn(query,'shyamsundhar1982@gmail.com'),'/workspace',query);
 }
});
test('missing next defaults to workspace',()=>{
 assert.equal(resolveLoginReturn('','shyamsundhar1982@gmail.com'),'/workspace');
});
