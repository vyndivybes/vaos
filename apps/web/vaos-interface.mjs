// Shared navigation owns presentation only; each existing page owns its data and authority.
const current=location.pathname.replace(/\.html$/,'').replace(/\/$/,'')||'/workspace';
for(const link of document.querySelectorAll('.va-product-nav a')){
 if(new URL(link.href,location.origin).pathname.replace(/\.html$/,'')===current)link.setAttribute('aria-current','page');
}
const toggle=document.querySelector('.va-module-toggle');
function closeModules(){document.body.removeAttribute('data-modules-open');toggle?.setAttribute('aria-expanded','false');}
toggle?.addEventListener('click',()=>{
 const open=toggle.getAttribute('aria-expanded')!=='true';
 toggle.setAttribute('aria-expanded',String(open));document.body.toggleAttribute('data-modules-open',open);
});
document.getElementById('module-nav')?.addEventListener('click',event=>{if(event.target.closest('[data-view]'))closeModules();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeModules();for(const menu of document.querySelectorAll('.va-tools-menu[open]')){menu.open=false;menu.querySelector('summary')?.focus();}}});
document.addEventListener('click',event=>{for(const menu of document.querySelectorAll('.va-tools-menu[open]'))if(!menu.contains(event.target))menu.open=false;});
const commandTabs=[...document.querySelectorAll('[data-command-tab]')];
function showCommand(name){
 for(const button of commandTabs)button.setAttribute('aria-pressed',String(button.dataset.commandTab===name));
 for(const view of document.querySelectorAll('[data-command-view]'))view.hidden=view.dataset.commandView!==name;
}
for(const button of commandTabs)button.addEventListener('click',()=>showCommand(button.dataset.commandTab));
function revealCommandAnchor(){const target=document.getElementById(location.hash.slice(1));const view=target?.closest('[data-command-view]');if(view)showCommand(view.dataset.commandView);}
window.addEventListener('hashchange',revealCommandAnchor);
revealCommandAnchor();
