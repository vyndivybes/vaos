// Navigation changes presentation only. Existing modules continue owning data and permissions.
const tabs=[...document.querySelectorAll('[data-premium-tab]')];
const views=[...document.querySelectorAll('[data-premium-view]')];
function showView(name,{focus=false}={}){
 if(!tabs.some(tab=>tab.dataset.premiumTab===name))name='overview';
 for(const tab of tabs)tab.setAttribute('aria-pressed',String(tab.dataset.premiumTab===name));
 for(const view of views)view.hidden=view.dataset.premiumView!==name;
 if(focus)document.querySelector('[data-premium-tab="'+name+'"]').focus();
}
for(const tab of tabs)tab.addEventListener('click',()=>{
 showView(tab.dataset.premiumTab);
 const url=new URL(location.href);url.searchParams.set('view',tab.dataset.premiumTab);
 history.replaceState(null,'',url);
});
document.getElementById('wa-period-employee')?.addEventListener('change',()=>showView('team'));
document.addEventListener('click',event=>{
 const target=event.target.closest('a[href^="#"]');
 if(!target)return;
 const destination=document.getElementById(target.getAttribute('href').slice(1));
 const view=destination?.closest('[data-premium-view]');
 if(view)showView(view.dataset.premiumView);
});
const params=new URL(location.href).searchParams;
showView(params.get('view')||(params.has('employee')?'team':'overview'));
