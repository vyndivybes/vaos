/**
 * Deterministic, bounded browser-only visualization contracts.
 *
 * These inputs represent illustrative or user-supplied, UNVERIFIED scenarios.
 * No transformation in this module confers source authority, audit status,
 * production telemetry, financial reconciliation or approval permission.
 */
const number=(v,name,{min=-1e9,max=1e9}={})=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+name);
 return v;
};
const label=(v,name)=> {
 if(typeof v!=='string'||!v.trim()||v.length>90||/[\x00-\x1f\x7f]/.test(v))throw Error('Invalid '+name);
 return v.trim();
};
const array=(v,name,min,max)=>{
 if(!Array.isArray(v)||v.length<min||v.length>max)throw Error('Invalid '+name+' count');
 return v;
};
const id=v=>{
 if(typeof v!=='string'||!(/^[a-z0-9][a-z0-9_-]{0,39}$/i).test(v))throw Error('Invalid graph identity');
 return v;
};
const finiteDays=v=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('Invalid date');
 const d=new Date(v+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)throw Error('Invalid date');
 return d.getTime()/86_400_000;
};

export function validateSankey(raw){
 if(!raw||typeof raw!=='object')throw Error('Missing Sankey data');
 const nodes=array(raw.nodes,'nodes',2,32).map(n=>({id:id(n?.id),label:label(n?.label,'node label')}));
 const seen=new Set();
 for(const n of nodes){if(seen.has(n.id))throw Error('Repeated Sankey node');seen.add(n.id);}
 const links=array(raw.links,'links',1,100).map(l=>({
  source:id(l?.source),target:id(l?.target),value:number(l?.value,'link value',{min:Number.EPSILON,max:1e9})
 }));
 const indegree=new Map(nodes.map(n=>[n.id,0])),adj=new Map(nodes.map(n=>[n.id,[]]));
 for(const link of links){
  if(!seen.has(link.source)||!seen.has(link.target)||link.source===link.target)throw Error('Invalid Sankey endpoint');
  indegree.set(link.target,indegree.get(link.target)+1);
  adj.get(link.source).push(link.target);
 }
 const queue=nodes.filter(n=>indegree.get(n.id)===0).map(n=>n.id);
 const layer=new Map(nodes.map(n=>[n.id,0]));
 let visited=0;
 for(let i=0;i<queue.length;i++){
  const from=queue[i];visited++;
  for(const to of adj.get(from)){
   layer.set(to,Math.max(layer.get(to),layer.get(from)+1));
   indegree.set(to,indegree.get(to)-1);
   if(indegree.get(to)===0)queue.push(to);
  }
 }
 if(visited!==nodes.length)throw Error('Sankey graph must not contain cycles');
 const incoming=new Map(nodes.map(n=>[n.id,0])),outgoing=new Map(nodes.map(n=>[n.id,0]));
 for(const l of links){
  incoming.set(l.target,incoming.get(l.target)+l.value);
  outgoing.set(l.source,outgoing.get(l.source)+l.value);
 }
 for(const v of [...incoming.values(),...outgoing.values()])
  if(!Number.isFinite(v)||v>1e10)throw Error('Total Sankey flow exceeds safe bounds');
 const enriched=nodes.map(n=>({...n,layer:layer.get(n.id),incoming:incoming.get(n.id),outgoing:outgoing.get(n.id),weight:Math.max(incoming.get(n.id),outgoing.get(n.id))}));
 const unit=raw.unit===undefined?'scenario units':label(raw.unit,'flow unit');
 return {nodes:enriched,links,unit};
}

export function sankeyLayout(raw,width=980,height=500){
 const data=validateSankey(raw);
 width=number(width,'diagram width',{min:380,max:2600});
 height=number(height,'diagram height',{min:280,max:1600});
 const maxLayer=Math.max(...data.nodes.map(n=>n.layer));
 const groups=Array.from({length:maxLayer+1},()=>[]);
 for(const node of data.nodes)groups[node.layer].push(node);
 const left=40,right=155,top=28,bottom=38,nodeW=15;
 const available=height-top-bottom;
 const gap=Math.min(13,Math.max(3,available/(Math.max(...groups.map(g=>g.length))*4)));
 const scale=Math.min(...groups.map(g=>{
  const total=g.reduce((s,n)=>s+n.weight,0);
  return total>0?(available-gap*(g.length-1))/total:available;
 }));
 if(!Number.isFinite(scale)||scale<=0)throw Error('Too many Sankey flows to show');
 const grid=new Map();
 groups.forEach((group,col)=>{
  const used=group.reduce((s,n)=>s+n.weight*scale,0)+gap*(group.length-1);
  let y=top+(available-used)/2;
  for(const n of group){
   const x=left+(maxLayer===0?0:(width-left-right-nodeW)*(col/maxLayer));
   const h=Math.max(0.75,n.weight*scale);
   grid.set(n.id,{...n,x,y,width:nodeW,height:h});
   y+=h+gap;
  }
 });
 const outOffset=new Map(data.nodes.map(n=>[n.id,0])),inOffset=new Map(data.nodes.map(n=>[n.id,0]));
 const links=data.links.map(l=>{
  const source=grid.get(l.source),target=grid.get(l.target);
  const weight=l.value*scale;
  const y1=source.y+outOffset.get(source.id)+weight/2;
  const y2=target.y+inOffset.get(target.id)+weight/2;
  outOffset.set(source.id,outOffset.get(source.id)+weight);
  inOffset.set(target.id,inOffset.get(target.id)+weight);
  const x1=source.x+nodeW,x2=target.x;
  return {...l,x1,x2,y1,y2,width:weight,path:`M ${x1.toFixed(2)} ${y1.toFixed(2)} C ${((x1+x2)/2).toFixed(2)} ${y1.toFixed(2)}, ${((x1+x2)/2).toFixed(2)} ${y2.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`};
 });
 return {nodes:[...grid.values()],links,width,height,unit:data.unit,sourceClass:'SCENARIO_UNVERIFIED'};
}

export function heatmapCells(raw){
 const columns=array(raw?.columns,'heatmap columns',1,24).map(v=>label(v,'column'));
 const rows=array(raw?.rows,'heatmap rows',1,24).map(r=>{
  const name=label(r?.label,'row');
  if(!Array.isArray(r.values)||r.values.length!==columns.length)throw Error('Heatmap row width mismatch');
  const values=r.values.map(v=>v===null?null:number(v,'heatmap cell',{min:0,max:1e9}));
  return {label:name,values};
 });
 const cells=rows.flatMap((r,ri)=>r.values.map((value,ci)=>({row:ri,col:ci,label:r.label,column:columns[ci],value})));
 return {columns,rows,cells,max:Math.max(0,...cells.filter(c=>c.value!==null).map(c=>c.value))};
}
export function waterfallSteps(raw){
 const steps=array(raw?.steps,'waterfall steps',1,20).map(v=>({label:label(v?.label,'waterfall label'),change:number(v?.change,'waterfall change')}));
 let running=0;
 return {steps:steps.map(s=>{const start=running;running+=s.change;if(!Number.isFinite(running)||Math.abs(running)>1e11)throw Error('Unsafe waterfall total');return {...s,start,end:running};}),total:running,unit:typeof raw.unit==='string'?label(raw.unit,'waterfall unit'):'scenario units'};
}
export function funnelStages(raw){
 const stages=array(raw?.stages,'funnel stages',2,15).map(s=>({label:label(s?.label,'funnel stage'),value:number(s?.value,'funnel value',{min:0,max:1e9})}));
 for(let i=1;i<stages.length;i++)if(stages[i].value>stages[i-1].value)throw Error('A funnel cannot gain population at a later stage');
 return {stages:stages.map((s,i)=>({...s,conversionPct:i===0||stages[i-1].value===0?null:Math.round(s.value/stages[i-1].value*10000)/100})),unit:typeof raw.unit==='string'?label(raw.unit,'funnel unit'):'scenario records'};
}
export function timelineBars(raw){
 const tasks=array(raw?.tasks,'timeline tasks',1,40).map(v=>{
  const start=finiteDays(v?.start),end=finiteDays(v?.end);
  if(end<start||end-start>365)throw Error('Invalid schedule interval');
  return {label:label(v?.label,'schedule task'),start:v.start,end:v.end,dayStart:start,dayEnd:end};
 });
 const start=Math.min(...tasks.map(t=>t.dayStart)),end=Math.max(...tasks.map(t=>t.dayEnd))+1;
 if(end-start>730)throw Error('Schedule horizon too long');
 const duration=Math.max(1,end-start);
 return {start:new Date(start*86_400_000).toISOString().slice(0,10),end:new Date((end-1)*86_400_000).toISOString().slice(0,10),
  tasks:tasks.map(t=>({...t,leftPct:(t.dayStart-start)/duration*100,widthPct:(t.dayEnd-t.dayStart+1)/duration*100}))};
}
export function routePoints(raw){
 const list=array(raw?.points,'route points',1,25).map(p=>({
  label:label(p?.label,'route label'),
  lat:number(p?.lat,'latitude',{min:-90,max:90}),
  lon:number(p?.lon,'longitude',{min:-180,max:180})
 }));
 const minLat=Math.min(...list.map(p=>p.lat)),maxLat=Math.max(...list.map(p=>p.lat));
 const minLon=Math.min(...list.map(p=>p.lon)),maxLon=Math.max(...list.map(p=>p.lon));
 const latRange=Math.max(0.01,maxLat-minLat),lonRange=Math.max(0.01,maxLon-minLon);
 return {points:list.map(p=>({...p,x:.12+.76*(p.lon-minLon)/lonRange,y:.12+.76*(maxLat-p.lat)/latRange})),kind:'SCHEMATIC_COORDINATE_PLOT_NOT_ROAD_ROUTING'};
}
export function factoryStationMap(raw){
 const stations=array(raw?.stations,'factory stations',1,30).map(s=>{
  const status=s?.status||'UNVERIFIED';
  if(!['UNVERIFIED','HOLD','SIMULATED_RUNNING','SIMULATED_IDLE','SIMULATED_FAULT'].includes(status))throw Error('Unsupported factory evidence state');
  return {id:id(s?.id),label:label(s?.label,'station label'),x:number(s?.x,'station x',{min:-10,max:10}),y:number(s?.y??0,'station height',{min:0,max:4}),
   z:number(s?.z,'station z',{min:-10,max:10}),status};
 });
 if(new Set(stations.map(s=>s.id)).size!==stations.length)throw Error('Repeated factory station');
 return {stations,sourceClass:'SIMULATED_TOPOLOGY_NO_MACHINE_TELEMETRY'};
}

/** Explicit synthetic demo data. Nothing here is a source observation. */
export const DEMO_VISUAL_SCENARIO=Object.freeze({
 schemaVersion:'VAOS_VISUAL_SCENARIO_V1',sourceClass:'SYNTHETIC_DEMO',
 description:'Synthetic engineering/manufacturing illustration. Not real VYNDI production, inventory, sales or cash data.',
 sankey:{
  unit:'illustrative units',
  nodes:[
   {id:'supplier',label:'Supplier'},{id:'receiving',label:'Receiving'},
   {id:'quarantine',label:'Quarantine'},{id:'stores',label:'Raw store'},
   {id:'production',label:'Production'},{id:'inspection',label:'Final QA'},
   {id:'finished',label:'Finished goods'},{id:'dispatch',label:'Dispatch'},
   {id:'scrap',label:'Scrap / rejected'}
  ],
  links:[
   {source:'supplier',target:'receiving',value:100},{source:'receiving',target:'quarantine',value:15},
   {source:'receiving',target:'stores',value:85},{source:'quarantine',target:'stores',value:10},
   {source:'quarantine',target:'scrap',value:5},{source:'stores',target:'production',value:95},
   {source:'production',target:'inspection',value:85},{source:'production',target:'scrap',value:10},
   {source:'inspection',target:'finished',value:83},{source:'inspection',target:'scrap',value:2},
   {source:'finished',target:'dispatch',value:83}
  ]
 },
 factory:{stations:[
  {id:'receiving',label:'Goods receiving',x:-5,z:-3,status:'SIMULATED_RUNNING'},
  {id:'quarantine',label:'Incoming QA',x:-1,z:-3,status:'SIMULATED_IDLE'},
  {id:'raw',label:'Raw materials',x:3,z:-3,status:'SIMULATED_RUNNING'},
  {id:'layup',label:'Composite layup',x:-5,z:2,status:'SIMULATED_RUNNING'},
  {id:'cure',label:'Curing oven',x:-1,z:2,status:'SIMULATED_IDLE'},
  {id:'finalqa',label:'Final inspection',x:3,z:2,status:'SIMULATED_FAULT'},
  {id:'dispatch',label:'Finished dispatch',x:6,z:5,status:'UNVERIFIED'}
 ]},
 heatmap:{columns:['Mon','Tue','Wed','Thu','Fri','Sat'],rows:[
  {label:'Composite layup',values:[72,82,65,76,91,70]},
  {label:'Curing',values:[88,93,82,75,80,null]},
  {label:'Inspection',values:[67,78,83,75,71,60]},
  {label:'Stores',values:[45,52,61,55,62,null]}
 ]},
 waterfall:{unit:'illustrative INR',steps:[
  {label:'Sales',change:120000},{label:'Material',change:-48000},{label:'Labour',change:-21000},
  {label:'Overhead',change:-18000},{label:'Logistics',change:-9000}
 ]},
 funnel:{unit:'illustrative opportunities',stages:[
  {label:'Leads',value:200},{label:'Qualified',value:90},
  {label:'Proposals',value:42},{label:'Negotiation',value:18},{label:'Won',value:8}
 ]},
 timeline:{tasks:[
  {label:'Frame design',start:'2026-11-05',end:'2026-11-10'},
  {label:'Material receiving',start:'2026-11-07',end:'2026-11-14'},
  {label:'Composite layup',start:'2026-11-13',end:'2026-11-18'},
  {label:'Curing',start:'2026-11-18',end:'2026-11-20'},
  {label:'QA acceptance',start:'2026-11-21',end:'2026-11-25'},
  {label:'Dispatch',start:'2026-11-26',end:'2026-11-27'}
 ]},
 logistics:{points:[
  {label:'Supplier',lat:12.9716,lon:77.5946},
  {label:'Factory',lat:11.0168,lon:76.9558},
  {label:'Customer',lat:13.0827,lon:80.2707}
 ]}
});
