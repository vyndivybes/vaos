/** Original VAOS editorial screen wall.
 * Progressive enhancement only: no tracking, third-party code, source reads or
 * modification of operational workspaces. Preview illustrations never imply live KPIs.
 */
const CATEGORIES=Object.freeze(['all','intelligence','operations','systems']);
export function galleryFilter(category,tiles){
 if(!CATEGORIES.includes(category))throw Error('KINETIC_CATEGORY_INVALID');
 if(!Array.isArray(tiles))throw Error('KINETIC_TILES_INVALID');
 return tiles.map(tile=>({id:tile.id,show:category==='all'||tile.category===category}));
}
export function initKineticGallery(doc=document){
 const section=doc.querySelector('.kinetic-intro');
 const gallery=doc.querySelector('.kinetic-gallery');
 const operational=doc.querySelector('#command-view');
 if(!section||!gallery||!operational)return ()=>{};
 const buttons=[...gallery.querySelectorAll('[data-kinetic-filter]')];
 const tiles=[...gallery.querySelectorAll('[data-kinetic-category]')];
 const status=doc.getElementById('kinetic-gallery-status');
 const valid=tiles.every(tile=>CATEGORIES.includes(tile.dataset.kineticCategory));
 if(!valid)return ()=>{};
 let selected='all',destroyed=false;
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??true;
 const motion=globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches&&!reduced;
 function apply(category){
  if(destroyed||!CATEGORIES.includes(category))return;
  selected=category;
  const result=galleryFilter(category,tiles.map((tile,index)=>({id:index,category:tile.dataset.kineticCategory})));
  let shown=0;
  result.forEach((item,index)=>{
   tiles[index].hidden=!item.show;
   if(item.show)shown++;
  });
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.kineticFilter===category));
  if(status)status.textContent=shown+' illustrated '+(shown===1?'workspace':'workspaces')+
   ' displayed. Open any preview for current evidence and authorization controls.';
 }
 for(const button of buttons){
  button.addEventListener('click',()=>apply(button.dataset.kineticFilter));
 }
 let observer=null,visibilityObserver=null;
 if(!reduced&&typeof IntersectionObserver==='function'){
  // Native animation is optional. The default without JS is fully visible.
  gallery.classList.add('kinetic-gallery--enhanced');
  observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(entry.isIntersecting){entry.target.dataset.kineticEntered='true';observer.unobserve(entry.target);}
   }
  },{rootMargin:'0px 0px 40px 0px',threshold:.07});
  for(const tile of tiles)observer.observe(tile);
 }
 if(motion){
  for(const tile of tiles){
   const screen=tile.querySelector('.kinetic-tile__screen');
   if(!screen)continue;
   tile.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse')return;
    const rect=tile.getBoundingClientRect();
    const x=Math.min(1,Math.max(0,(event.clientX-rect.left)/Math.max(rect.width,1)));
    const y=Math.min(1,Math.max(0,(event.clientY-rect.top)/Math.max(rect.height,1)));
    screen.style.setProperty('--kinetic-tilt-y',((x-.5)*5).toFixed(2)+'deg');
    screen.style.setProperty('--kinetic-tilt-x',((.5-y)*4).toFixed(2)+'deg');
   },{passive:true});
   tile.addEventListener('pointerleave',()=>{
    screen.style.removeProperty('--kinetic-tilt-y');
    screen.style.removeProperty('--kinetic-tilt-x');
   });
  }
 }
 function syncOperationalView(){section.hidden=operational.hidden;}
 syncOperationalView();
 if(typeof MutationObserver==='function'){
  visibilityObserver=new MutationObserver(syncOperationalView);
  visibilityObserver.observe(operational,{attributes:true,attributeFilter:['hidden']});
 }
 apply('all');
 return ()=>{
  destroyed=true;observer?.disconnect();visibilityObserver?.disconnect();
  gallery.classList.remove('kinetic-gallery--enhanced');
 };
}
if(typeof document!=='undefined')initKineticGallery(document);
