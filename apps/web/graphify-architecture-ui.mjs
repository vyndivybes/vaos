/**
 * Curated Graphify VAOS code topology lens. Offline, source-pinned and read-only.
 * This does not call the Graphify SaaS or impersonate its live source registry.
 */
import {
 GRAPHIFY_VAOS_SNAPSHOT,GRAPHIFY_VAOS_NODES,projectGraphifyArchitecture,graphifyNodeHref
} from './graphify-architecture-model.mjs';

const NS='http://www.w3.org/2000/svg';
const palette=Object.freeze({
 knowledge:'#d1aaff',analytics:'#70d4ff',business:'#5de8b5',runtime:'#ffbf89'
});
const name=Object.freeze({
 knowledge:'Neural knowledge',analytics:'Visual analytics',
 business:'Business data',runtime:'Runtime safeguards'
});
const el=(tag,className,text)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const svgEl=(tag,attrs={})=>{
 const node=document.createElementNS(NS,tag);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
 return node;
};
const selectedText=(node)=>node?.label||'Select a code module';
function positions(nodes){
 const groups=['knowledge','analytics','business','runtime'];
 const columns=new Map(groups.map((group,i)=>[group,{x:115+i*255,items:nodes.filter(n=>n.group===group)}]));
 const points=new Map();
 for(const [group,column] of columns){
  const items=column.items;
  items.forEach((node,i)=>{
   const spacing=items.length>6?63:77;
   const top=Math.max(46,(500-(items.length-1)*spacing)/2);
   points.set(node.id,{x:column.x,y:top+i*spacing});
  });
 }
 return points;
}

export function mountGraphifyArchitecture(root,{businessStatus='NOT_CHECKED'}={}){
 if(!root)throw Error('GRAPHIFY_LENS_HOST_REQUIRED');
 root.replaceChildren();
 root.classList.add('gf-lens');
 const heading=el('div','gf-heading');
 const headingCopy=el('div','gf-heading-copy');
 headingCopy.append(el('p','gf-kicker','SOURCE-PINNED / GRAPHIFY CODE INDEX'),
  el('h3','gf-heading-title','VAOS neural and business architecture'),
  el('p','gf-description','Explore Graphify-confirmed code imports for knowledge, analytics, business-data and runtime modules. These arrows show code dependencies, not live business or neural service connections.'));
 const pin=el('div','gf-pin');
 pin.append(el('strong',null,'CODE SNAPSHOT'),
  el('code',null,GRAPHIFY_VAOS_SNAPSHOT.commitSha.slice(0,12)),
  el('span',null,'Indexed 21 Nov 2026'));
 heading.append(headingCopy,pin);
 const counts=el('div','gf-counts');
 const totals=[
  [GRAPHIFY_VAOS_SNAPSHOT.indexedNodeCount.toLocaleString('en-IN'),'Indexed code nodes'],
  [GRAPHIFY_VAOS_SNAPSHOT.indexedEdgeCount.toLocaleString('en-IN'),'Indexed code edges'],
  [GRAPHIFY_VAOS_SNAPSHOT.communityCount.toLocaleString('en-IN'),'Code communities']
 ];
 for(const [num,label] of totals){const stat=el('div','gf-count');stat.append(el('strong',null,num),el('span',null,label));counts.append(stat);}
 const note=el('p','gf-pinned-note','This visualization is a curated subset of the Graphify index, not all indexed nodes. No live Graphify token, paid service, operational mutation or synthetic business metric is used.');

 const controls=el('div','gf-controls');
 const searchLabel=el('label','gf-field');searchLabel.append(el('span',null,'Find code nodes'));
 const search=el('input');search.type='search';search.maxLength=100;
 search.placeholder='Search modules, files or domains';
 search.setAttribute('aria-label','Find Graphify indexed code modules');searchLabel.append(search);
 const groupLabel=el('label','gf-field');groupLabel.append(el('span',null,'Code domain'));
 const group=el('select');group.setAttribute('aria-label','Filter indexed code domain');
 for(const [value,label] of [['all','All domains'],...Object.entries(name)]){
  const opt=el('option',null,label);opt.value=value;group.append(opt);
 }
 groupLabel.append(group);
 const clear=el('button','gf-small-btn','Reset graph');clear.type='button';
 const mode=el('button','gf-three-toggle','Enable 3D');mode.type='button';
 mode.setAttribute('aria-pressed','false');
 const modeStatus=el('span','gf-mode-status','2D read-only code graph');
 modeStatus.setAttribute('role','status');modeStatus.setAttribute('aria-live','polite');
 controls.append(searchLabel,groupLabel,clear,mode,modeStatus);
 const content=el('div','gf-layout');
 const stage=el('div','gf-stage');
 const visual=svgEl('svg',{class:'gf-svg',viewBox:'0 0 1020 550',role:'group',
  'aria-label':'Graphify indexed VAOS import relationships. Select a node or use the accessible list to inspect its code dependencies.'});
 const svgTitle=svgEl('title');svgTitle.textContent='Indexed VAOS code dependencies';
 visual.append(svgTitle);
 stage.append(visual);
 const footer=el('p','gf-stage-footer','Arrow direction: importing file → imported dependency. Source: Graphify promoted VAOS code graph.');
 stage.append(footer);
 const inspector=el('aside','gf-inspector');
 const inspectLabel=el('p','gf-kicker','NODE INSPECTOR / PINNED CODE');
 const inspectName=el('h4','gf-selected-title','Select a code module');
 const inspectPath=el('code','gf-path','');
 const inspectLinks=el('p','gf-linked-summary','');
 const inspectOpen=el('a','gf-source-link','Open pinned source');inspectOpen.target='_blank';
 inspectOpen.rel='noopener noreferrer';
 inspectOpen.hidden=true;
 const listLabel=el('h5','gf-list-heading','Visible code nodes');
 const list=el('div','gf-node-list');
 inspector.append(inspectLabel,inspectName,inspectPath,inspectLinks,inspectOpen,listLabel,list);
 content.append(stage,inspector);
 const business=el('div','gf-business-boundary');
 const biState=el('strong','gf-bi-state','Business source: not checked');
 const businessCopy=el('p',null,'Signed enterprise BI source checks are independent of this code graph. Repository imports never certify CRM, finance, inventory, operational readiness or knowledge synchronization.');
 const businessLink=el('a',null,'Open signed-source business analytics');
 businessLink.href='/spatial-command.html';
 business.append(biState,businessCopy,businessLink);
 const legend=el('div','gf-legend');
 legend.setAttribute('aria-label','Code domain colours');
 for(const [key,label] of Object.entries(name)){
  const item=el('span');
  const dot=el('i');dot.setAttribute('aria-hidden','true');dot.style.backgroundColor=palette[key];
  item.append(dot,document.createTextNode(label));legend.append(item);
 }
 root.append(heading,counts,note,controls,legend,content,business);
 let query='',filter='all',focus='all',threeScene=null,revision=0,disposed=false;
 let last=projectGraphifyArchitecture(),activeBusinessStatus=businessStatus;
 function setBusinessStatus(status){
  if(disposed)return;
  const valid=['HOLD','PARTIAL','OBSERVED','NOT_CHECKED'].includes(status)?status:'NOT_CHECKED';
  activeBusinessStatus=valid;
  biState.textContent='Signed business source: '+(valid==='NOT_CHECKED'?'NOT CHECKED':valid);
  biState.dataset.state=valid;
 }
 function stopThree(){
  revision++;
  threeScene?.dispose();threeScene=null;
  mode.disabled=false;mode.textContent='Enable 3D';mode.setAttribute('aria-pressed','false');
  visual.hidden=false;
  modeStatus.textContent='2D read-only code graph';
 }
 function select(id){
  focus=focus===id?'all':id;
  draw();
 }
 function draw(){
  if(disposed)return;
  if(threeScene)stopThree();
  last=projectGraphifyArchitecture({query,group:filter,focus});
  const position=positions(last.nodes);
  visual.replaceChildren(svgTitle);
  for(const edge of last.edges){
   const start=position.get(edge.from),end=position.get(edge.to);
   if(!start||!end)continue;
   const line=svgEl('path',{d:`M ${start.x+17} ${start.y} Q ${(start.x+end.x)/2} ${(start.y+end.y)/2-17} ${end.x-17} ${end.y}`,
    fill:'none',stroke:'#6ca9c5','stroke-width':1.65,opacity:.6});
   const label=svgEl('title');
   label.textContent=edge.from+' imports '+edge.to+' (Graphify indexed)';
   line.append(label);visual.append(line);
  }
  for(const node of last.nodes){
   const pos=position.get(node.id);
   const item=svgEl('g',{role:'button',tabindex:0,'aria-label':'Inspect '+node.label,
    'data-code-node':node.id});
   const dot=svgEl('circle',{cx:pos.x,cy:pos.y,r:17,fill:'#102b3e',stroke:palette[node.group],
    'stroke-width':focus===node.id?3:1.7});
   const core=svgEl('circle',{cx:pos.x,cy:pos.y,r:5,fill:palette[node.group]});
   const text=svgEl('text',{x:pos.x+23,y:pos.y+5,fill:'#edf6fc','font-size':12,
    'font-family':'system-ui, sans-serif'});
   text.textContent=node.label.length>27?node.label.slice(0,24)+'…':node.label;
   const title=svgEl('title');title.textContent=node.path;
   item.append(dot,core,text,title);
   item.addEventListener('click',()=>select(node.id));
   item.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();select(node.id);}
   });
   visual.append(item);
  }
  const selected=last.nodes.find(n=>n.id===focus)||last.nodes[0]||null;
  inspectName.textContent=selectedText(selected);
  inspectPath.textContent=selected?.path||'No indexed module matched your filter';
  const incoming=selected?last.edges.filter(e=>e.to===selected.id).length:0;
  const outgoing=selected?last.edges.filter(e=>e.from===selected.id).length:0;
  inspectLinks.textContent=selected
   ?'Visible import dependencies: '+outgoing+' outgoing, '+incoming+' incoming. These are static code edges only.'
   :'No matching modules. Clear the filter to restore the pinned index subset.';
  inspectOpen.hidden=!selected;
  if(selected)inspectOpen.href=graphifyNodeHref(selected);
  list.replaceChildren();
  for(const node of last.nodes){
   const button=el('button','gf-node-button');
   button.type='button';button.dataset.group=node.group;
   button.setAttribute('aria-pressed',String(node.id===focus));
   button.append(el('span','gf-node-label',node.label),
    el('small',null,node.group+' · '+node.id));
   button.addEventListener('click',()=>select(node.id));list.append(button);
  }
  if(!last.nodes.length)list.append(el('p','gf-empty','No code nodes match this filter.'));
  footer.textContent=last.nodes.length+' curated code nodes / '+last.edges.length+
   ' indexed import edges shown. Graphify source pin: '+GRAPHIFY_VAOS_SNAPSHOT.commitSha.slice(0,12)+
   '. Not operational lineage.';
 }
 async function enableThree(){
  if(disposed)return;
  if(threeScene){stopThree();return;}
  const stamp=++revision;
  mode.disabled=true;modeStatus.textContent='Preparing local 3D code topology…';
  try{
   const {mountGraphifyArchitectureThree}=await import('./graphify-architecture-three.mjs');
   if(stamp!==revision||disposed)return;
   const scene=await mountGraphifyArchitectureThree(stage,last,{onSelect:select});
   if(stamp!==revision||disposed){scene.dispose();return;}
   threeScene=scene;visual.hidden=true;
   mode.textContent='Return to 2D';mode.setAttribute('aria-pressed','true');
   modeStatus.textContent='3D pinned code imports, not live neural or business links';
  }catch{
   if(stamp===revision){visual.hidden=false;
    modeStatus.textContent='3D unavailable; accessible 2D code graph remains ready.';}
  }finally{if(stamp===revision)mode.disabled=false;}
 }
 search.addEventListener('input',()=>{
  query=search.value;focus='all';draw();
 });
 group.addEventListener('change',()=>{
  filter=group.value;focus='all';draw();
 });
 clear.addEventListener('click',()=>{
  query='';filter='all';focus='all';search.value='';group.value='all';draw();
 });
 mode.addEventListener('click',enableThree);
 draw();setBusinessStatus(activeBusinessStatus);
 return {setBusinessStatus,dispose(){
  if(disposed)return;stopThree();disposed=true;root.replaceChildren();
 }};
}
