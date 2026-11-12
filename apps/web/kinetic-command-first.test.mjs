import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('live cockpit precedes the optional and collapsed gallery on initial load',()=>{
 const html=read('./workspace.html');
 const start=html.indexOf('<section class="kinetic-intro"');
 const command=html.indexOf('<form class="workspace-search');
 const cockpit=html.indexOf('<section id="command-view"');
 const module=html.indexOf('<section id="module-view"');
 assert.ok(command>=0&&cockpit>command&&start>cockpit&&module>start,
  'Search and live command cockpit must appear before the optional illustrated tour');
 const first=html.slice(start,module);
 assert.match(first,/Workspace tour/);
 const workbench=html.slice(cockpit,start);
 assert.match(workbench,/class="workspace-workbench"/);
 assert.ok(workbench.indexOf("vaos-main-voice")<workbench.indexOf("founder-cockpit"));
 assert.match(workbench,/<details class="workspace-suggestions">\s*<summary>Suggested questions<\/summary>/);
 assert.match(workbench,/<details class="workspace-details">/);
 assert.doesNotMatch(workbench,/<details class="workspace-details" open/);
 assert.doesNotMatch(html.slice(command,cockpit),/class="kinetic-gallery"/);
 assert.match(first,/<details\b[^>]*class="kinetic-exhibition"[^>]*>/);
 assert.doesNotMatch(first,/<details\b[^>]*class="kinetic-exhibition"[^>]*\bopen\b/);
 assert.ok(first.indexOf('<summary')<first.indexOf('class="kinetic-gallery"'));
 assert.match(html,/id="command-bar"/);
 assert.match(html,/id="command-view"/);
 assert.match(html,/id="founder-cockpit"/);
});

test('quick actions lead to original governed workspaces, not simulated data or action execution',()=>{
 const html=read('./workspace.html');
 const first=html.match(/<nav class="va-product-nav"[^>]*>[\s\S]*?<\/nav>/)?.[0];
 assert.ok(first);
 for(const route of ['/visual-intelligence.html?viz=evidence','/visual-command.html','/neural-knowledge.html','/mission-status.html']){
  assert.ok(first.includes('href="'+route+'"'),route);
 }
 assert.match(first,/Analytics/);
 assert.match(html,/Interface previews only\./);
 assert.doesNotMatch(first,/<iframe\b|<script\b|formaction=|onclick=/i);
});

test('compact style removes poster-scale typography and duplicate sidebar logo',()=>{
 const css=read('./vaos-kinetic.css');
 assert.match(css,/\.workspace-workbench\s*\{/);
 assert.match(css,/\.kinetic-exhibition\s*\{/);
 assert.match(css,/\.workspace-details\s*\{/);
 assert.match(css,/\.workspace-body \.sidebar-brand-card\s*\{\s*display:none!important/);
 assert.match(css,/\.workspace-body #module-title/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/:focus-visible/);
});

test('existing gallery behavior and controls survive in the expandable atlas',()=>{
 const html=read('./workspace.html');
 const js=read('./kinetic-wall.mjs');
 assert.equal([...html.matchAll(/class="kinetic-tile /g)].length,10);
 for(const category of ['all','intelligence','operations','systems']){
  assert.ok(html.includes('data-kinetic-filter="'+category+'"'));
 }
 assert.match(js,/function apply\(category\)/);
 assert.match(js,/operational\.hidden/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|sendBeacon/);
});
