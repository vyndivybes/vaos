import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(file, import.meta.url), 'utf8');

test('Taste v1 is limited to the VAOS shell with explicit 8/5/5 controls', async () => {
  const css = await read('./vaos-shell.css');
  assert.match(css, /--vaos-design-variance:\s*8\s*;/);
  assert.match(css, /--vaos-motion-intensity:\s*5\s*;/);
  assert.match(css, /--vaos-visual-density:\s*5\s*;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.vaos-workspace-menu\[open\]/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.doesNotMatch(css.slice(css.indexOf('VAOS Taste v1 foundation')), /@import\s+url\(https?:/);
});

test('the VAOS navigation keeps five core routes and specialist workspaces accessible', async () => {
  const source = await read('./vaos-shell.mjs');
  const primary = source.match(/const primary = \[([\s\S]*?)\n\];/);
  assert.ok(primary, 'primary navigation is declared');
  for (const destination of ['JARVIS', 'Missions', 'Intelligence', 'Agents', 'Knowledge']) {
    assert.match(primary[1], new RegExp("\\['" + destination + "',"));
  }
  assert.equal((primary[1].match(/^  \['/gm) || []).length, 5);
  for (const destination of [
    '/spatial-command.html',
    '/visual-command.html',
    '/agent-exchange.html',
    '/founder-console.html',
    '/jarvis-multimodal.html'
  ]) {
    assert.ok(source.includes(destination), 'retains specialist route ' + destination);
  }
  assert.match(source, /toggle\.textContent = 'All workspaces'/);
  assert.match(source, /if \(event\.key === 'Escape' && menu\.open\)/);
});

test('VAOS shell does not change permissions, API routes or operational authority', async () => {
  const [shell, css] = await Promise.all([read('./vaos-shell.mjs'), read('./vaos-shell.css')]);
  assert.doesNotMatch(shell, /fetch\(|XMLHttpRequest|\/api\//);
  assert.doesNotMatch(css.slice(css.indexOf('VAOS Taste v1 foundation')), /display:\s*none\s*!important/);
});


test('JARVIS home offers real command shortcuts and keeps live evidence controls', async () => {
  const [html, css] = await Promise.all([
    read('./workspace.html'), read('./vaos-shell.css')
  ]);
  assert.match(html, /class="vaos-action-rail"/);
  for(const target of [
    '/mission-status.html', '/agent-supervision.html',
    '/founder-console.html', '/neural-knowledge.html'
  ]) {
    assert.ok(html.includes('href="' + target + '"'), 'preserves destination ' + target);
  }
  for(const id of [
    'vaos-main-voice', 'cockpit-employee-count', 'cockpit-decision-count',
    'cockpit-source-count', 'control-plane-status'
  ]) {
    assert.ok(html.includes('id="' + id + '"'), 'preserves live value ' + id);
  }
  assert.match(css, /Taste v1 founder-command composition/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.35fr\) minmax\(320px,\.83fr\)/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
