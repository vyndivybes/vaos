const primary = [
  ['JARVIS', '/workspace', 'workspace'],
  ['Spatial Command', '/spatial-command.html', 'spatial-command'],
  ['Analytics', '/visual-intelligence.html?viz=overview', 'visual-intelligence'],
  ['Knowledge', '/neural-knowledge.html', 'neural-knowledge'],
  ['Missions', '/mission-status.html', 'mission-status']
];

const workspaces = [
  ['Operate', [
    ['Founder Command', '/founder-console.html', 'founder-console'],
    ['Agent monitoring', '/agent-supervision.html', 'agent-supervision'],
    ['Team analytics', '/workforce-analytics.html', 'workforce-analytics'],
    ['Company startup', '/prelaunch-workspace.html', 'prelaunch-workspace'],
    ['Workforce exercises', '/workforce-exercise.html', 'workforce-exercise']
  ]],
  ['Explore', [
    ['Visual Command', '/visual-command.html', 'visual-command'],
    ['Market intelligence', '/market-intelligence.html', 'market-intelligence'],
    ['Engineering viewer', '/engineering-viewer.html', 'engineering-viewer'],
    ['Camera and files', '/jarvis-multimodal.html', 'jarvis-multimodal']
  ]],
  ['Manage', [
    ['JARVIS skills', '/skills.html', 'skills'],
    ['JARVIS checks', '/founder-console.html#g3-intelligence-panel'],
    ['Slack connection', '/slack-qualification.html', 'slack-qualification']
  ]]
];

const header = document.querySelector('[data-vaos-header]');
const page = document.body.dataset.vaosView;
const nav = document.createElement('nav');
nav.className = 'vaos-primary-nav';
nav.setAttribute('aria-label', 'Main navigation');

function createLink([label, href, view]) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  if (view === page) link.setAttribute('aria-current', 'page');
  return link;
}

nav.append(...primary.map(createLink));

const menu = document.createElement('details');
menu.className = 'vaos-workspace-menu';
const toggle = document.createElement('summary');
toggle.textContent = 'Workspaces';
const directory = document.createElement('div');
directory.className = 'vaos-workspace-directory';
for (const [group, links] of workspaces) {
  const list = document.createElement('ul');
  list.setAttribute('aria-label', group);
  const heading = document.createElement('li');
  heading.className = 'vaos-workspace-group';
  heading.textContent = group;
  list.append(heading);
  for (const route of links) {
    const row = document.createElement('li');
    row.append(createLink(route));
    list.append(row);
  }
  directory.append(list);
}

menu.append(toggle, directory);
nav.append(menu);

const existing = header.querySelector('nav');
if (existing) {
  existing.hidden = true;
  existing.after(nav);
} else {
  header.append(nav);
}
header.dataset.vaosReady = '';

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    toggle.focus();
  }
});

document.addEventListener('click', event => {
  if (menu.open && !menu.contains(event.target)) menu.open = false;
});
