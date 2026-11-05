import test from 'node:test';
import assert from 'node:assert/strict';
import {VISUAL_MODES, resolveVisualMode, getVisualMode} from './visual-command-model.mjs';

test('visual command has distinct, same-origin destination paths', () => {
  assert.equal(new Set(VISUAL_MODES.map(item=>item.id)).size,VISUAL_MODES.length);
  assert.ok(VISUAL_MODES.length>=8);
  for(const item of VISUAL_MODES){
    assert.match(item.href,/^\/(?!\/)[a-z0-9./?=&-]+$/);
    assert.ok(['bi','embed','link'].includes(item.renderer));
    assert.ok(item.title.length>0);
  }
});

test('voice/text visual requests select existing governed workspaces',()=>{
  for(const [request,id] of [
    ['Show my business intelligence dashboard','bi'],
    ['Show the Graphiti brain graph','graph'],
    ['Open the CAD STL 3D engineering viewer','engineering'],
    ['Show agent missions','agents'],
    ['Show profit and cash flow','finance'],
    ['Show HR workforce','people'],
    ['Show the production MES status','operations'],
    ['Show risk and approvals','governance'],
  ])assert.equal(resolveVisualMode(request)?.id,id,request);
});

test('ambiguous and unrecognized commands do not issue an unintended action',()=>{
  assert.equal(resolveVisualMode(''),null);
  assert.equal(resolveVisualMode('send email to everyone'),null);
  assert.equal(resolveVisualMode('delete production records'),null);
  assert.equal(getVisualMode('../../private'),null);
});

test('predefined visual workspaces are read-only or existing navigation',()=>{
  const e=getVisualMode('engineering');
  assert.equal(e.renderer,'embed');
  assert.equal(e.href,'/engineering-viewer.html');
  assert.equal(getVisualMode('bi').renderer,'bi');
});