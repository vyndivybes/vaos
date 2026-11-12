import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const read=async path=>readFile(new URL(path,import.meta.url),'utf8');
const themePath='./vaos-kinetic.css';

test('all VAOS HTML workspaces load the shared application shell',async()=>{
 const pages=(await readdir(new URL('./',import.meta.url))).filter(name=>name.endsWith('.html'));
 assert.ok(pages.length>=17,'all existing workspaces should remain available');
 for(const page of pages){
  const html=await read('./'+page);
  const styles=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)].map(match=>match[0]);
  assert.ok(styles.length>=1,page+' has styles');
  assert.match(styles.at(-1),/href=["']\/vaos-shell\.css["']/i,page+' loads the application shell last');
  assert.equal(styles.filter(link=>link.includes('/vaos-shell.css')).length,1,page+' loads the application shell once');
  if (!['index.html','login.html'].includes(page)) {
   assert.match(html,/data-vaos-header/);
   assert.match(html,/src="\/vaos-shell\.mjs"/);
  }
 }
});

test('founder command homepage presents real workspace links instead of invented KPI screenshots',async()=>{
 const html=await read('./workspace.html');
 assert.match(html,/class="kinetic-intro"/);
 assert.match(html,/id="kinetic-title"/);
 for(const href of ['/neural-knowledge.html','/visual-command.html','/founder-console.html'])
  assert.ok(html.includes('href="'+href+'"'),'launch point '+href);
 assert.match(html,/Interface previews only/);
 assert.match(html,/id="command-view"/,'live operational cockpit must remain');
 assert.match(html,/id="command-bar"/,'existing command control must remain');
 assert.doesNotMatch(html,/<iframe\b/i,'no nested dashboard');
});

test('new theme uses editorial typography, responsive presentation and accessible reduced motion',async()=>{
 const css=await read(themePath);
 for(const token of ['--kinetic-bg','--kinetic-ink','--kinetic-accent','--kinetic-border'])
  assert.ok(css.includes(token),token);
 assert.match(css,/\.kinetic-intro/);
 assert.match(css,/\.kinetic-feature/);
 assert.match(css,/@media\s*\(max-width:\s*760px\)/);
 assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/@import\s+url\(https?:/i,'theme assets must not require a paid or external provider');
});
