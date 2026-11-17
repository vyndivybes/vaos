import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startSceneParallax } from './scene-parallax.mjs';

const load = file => readFileSync(new URL(file, import.meta.url), 'utf8');

test('login exposes the branded sign-in form with email and password manager support', () => {
  const html = load('./login.html');
  for (const id of ['login-form', 'email', 'password', 'remember', 'login-status', 'submit-button', 'access-help', 'cinematic-scene']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(html, /method="post" action="\/api\/login"/);
  assert.match(html, /src="\/assets\/vayu-shastr-cinematic\.webp"/);
  assert.match(html, /autocomplete="username"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /aria-live="polite"/);
});

test('root and explicit login routes expose the same scene and sign-in controls', () => {
  const canonical = load('./login.html')
    .replace('data-app-page="login"', 'data-app-page="index"')
    .replace('data-vaos-view="login"', 'data-vaos-view="index"');
  assert.equal(load('./index.html'), canonical);
});

test('login layout uses a single column on narrow displays and static art for reduced motion', () => {
  const css = load('./login-cinematic.css');
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('parallax renders the latest pointer position per frame and stops when motion is reduced', () => {
  const events = new Map();
  const styles = new Map();
  const frames = [];
  const motion = { matches: false, addEventListener: (_type, listener) => events.set('motion-change', listener) };
  const win = {
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: query => query.includes('reduced-motion') ? motion : { matches: true },
    addEventListener: (type, listener) => events.set(type, listener),
    document: { documentElement: { addEventListener: (type, listener) => events.set(type, listener) } },
    requestAnimationFrame: render => frames.push(render),
  };
  startSceneParallax({ style: { setProperty: (name, value) => styles.set(name, value) } }, win);

  const move = events.get('pointermove');
  move({ clientX: 0, clientY: 0, pointerType: 'mouse' });
  move({ clientX: 1000, clientY: 800, pointerType: 'mouse' });
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(styles.get('--scene-x'), '26.00px');
  assert.equal(styles.get('--scene-rx'), '-6.00deg');

  events.get('pointerleave')();
  frames.shift()();
  assert.equal(styles.get('--scene-x'), '0.00px');

  motion.matches = true;
  events.get('motion-change')();
  frames.shift()();
  move({ clientX: 1000, clientY: 800, pointerType: 'mouse' });
  assert.equal(frames.length, 0);
  assert.equal(styles.get('--scene-x'), '0.00px');

  motion.matches = false;
  move({ clientX: 1000, clientY: 800, pointerType: 'touch' });
  assert.equal(frames.length, 0);
});

test('cinematic login renders exactly one canonical licensed footer', () => {
  const html = load('./login.html');
  const exact = '© 2026 Vāyū Shastr Pvt. Ltd. All Rights Reserved.';
  assert.equal(html.split(exact).length - 1, 1, 'canonical copyright must appear once');
  assert.match(html, /<footer class="cinematic-legal">\s*<span>© 2026 Vāyū Shastr Pvt\. Ltd\. All Rights Reserved\.<\/span>/);
});

test('all VAOS public screens use the approved product name and official identity', () => {
  const name = 'VAOS Agentic AI Autonomous Ecosystem';
  for (const page of ['./login.html', './index.html', './workspace.html', './mission-status.html', './agent-supervision.html', './slack-qualification.html']) {
    const html = load(page);
    assert.ok(html.includes(name), page + ' lacks the approved VAOS product name');
    assert.match(html, /\/assets\/vayu-shastr-original\.webp/, page + ' lacks the official Vāyū logo');
    assert.match(html, /<link rel="icon" type="image\/webp" href="\/assets\/vayu-shastr-original\.webp"/, page + ' lacks branded favicon');
    assert.doesNotMatch(html, /VYNDI Agentic Operating System/i, page + ' still uses obsolete product description');
  }
});
