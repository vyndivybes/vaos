import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialViewMemory, isSpatialRecall, spatialViewFromHash } from './spatial-view-memory.mjs';

test('same-tab recall restores the exact allowlisted sheet and 3D node and expires after 30 minutes', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  let time = 100;
  const session = () => createSpatialViewMemory({ storage, now: () => time });
  assert.equal(session().save('sheets', 'dispatch'), true);
  const sheet = session().recall();
  assert.equal(sheet.label, 'Dispatch sheet');
  assert.deepEqual(spatialViewFromHash(new URL(sheet.href,'https://vaos.example').hash), sheet);
  assert.equal(session().save('lineage', 'VYNDI OS'), true);
  const node = session().recall();
  assert.equal(node.label, 'VYNDI OS in 3D Knowledge');
  assert.deepEqual(spatialViewFromHash(new URL(node.href,'https://vaos.example').hash), node);
  assert.equal(session().save('sheets', 'sensitive report body'), false);
  assert.doesNotMatch([...values.values()][0], /report body|https:/);
  time += 30 * 60 * 1000;
  assert.equal(session().recall(), null);
});
test('recognition accepts spatial recall and excludes broad navigation or business instructions', () => {
  assert.equal(isSpatialRecall('Where did I leave off?'), true);
  assert.equal(isSpatialRecall('What was I looking at?'), true);
  assert.equal(isSpatialRecall('Show me my last graph node'), true);
  assert.equal(isSpatialRecall('Show me all payroll records'), false);
  assert.equal(spatialViewFromHash('#lineage=https%3A%2F%2Fevil.example'), null);
});
