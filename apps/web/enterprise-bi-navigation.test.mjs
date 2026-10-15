import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.handlers={};this.style={};this.textContent='';this.value='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this[name]=value;}
 addEventListener(name,callback){this.handlers[name]=callback;}
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
function packet(offset=0,scope='all'){
 return {schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,scope,
  period:{from:'2026-10-01',to:'2026-10-15'},departments:[{
   employeeId:'risk',status:'OBSERVED',periodEventCount:31,currentSourceCount:41,currentAttentionCount:10,
   statusDistribution:Array.from({length:6},(_,i)=>({status:'Status '+i,count:i+1})),
   currentStatusDistribution:[{status:'OPEN',count:10}],
   records:[{date:'2026-10-02',status:'OPEN',fields:{id:'risk-'+offset}}],
   detailPage:{offset,limit:30,hasMore:offset===0},sourceTable:'vyndi_risk_intelligence',
  }]};
}
async function setup(fetch,module='enterprise-bi.mjs'){
 const ids=new Map();
 const get=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);};
 get('wa-period-from').value='2026-10-01';get('wa-period-to').value='2026-10-15';
 const context={document:{getElementById:get,createElement:tag=>new Element(tag),addEventListener(){}},
  fetch,URLSearchParams,location:{assign(){throw Error('unexpected redirect');}}};
 runInNewContext(await readFile(new URL('./'+module,import.meta.url),'utf8'),context);
 return {context,get};
}
test('all recorded statuses stay visible and source pages request the scoped next offset',async()=>{
 const requests=[];
 const {context,get}=await setup(async url=>{
  requests.push(url);const q=new URL(url,'https://vaos.local').searchParams;
  return {ok:true,status:200,json:async()=>({data:packet(Number(q.get('offset')||0),q.get('employee'))})};
 });
 await context.refresh();
 let nodes=descendants(get('wa-enterprise-grid'));
 assert.ok(nodes.some(n=>n.textContent==='Status 5'));
 assert.ok(nodes.some(n=>n.href==='https://vyndios.vayushastr.workers.dev/command/governance'));
 assert.equal(nodes.find(n=>n['aria-label']==='Risk: previous records').disabled,true);
 await nodes.find(n=>n['aria-label']==='Risk: next records').handlers.click();
 assert.equal(new URL(requests[1],'https://vaos.local').searchParams.get('offset'),'30');
 assert.equal(new URL(requests[1],'https://vaos.local').searchParams.get('employee'),'risk');
 nodes=descendants(get('wa-enterprise-grid'));
 assert.ok(nodes.some(n=>n.textContent==='risk-30'));
 assert.equal(nodes.find(n=>n['aria-label']==='Risk: next records').disabled,true);
 assert.equal(nodes.find(n=>n.tag==='details').open,true);
});
test('changing to an invalid period clears old evidence instead of relabelling it',async()=>{
 const {context,get}=await setup(async()=>({ok:true,status:200,json:async()=>({data:packet()})}));
 await context.refresh();assert.ok(get('wa-enterprise-grid').children.length);
 get('wa-period-from').value='2026-11-01';
 await context.refresh();
 assert.equal(get('wa-enterprise-grid').children.length,0);
 assert.equal(get('wa-enterprise-kpis').children.length,0);
 assert.equal(get('wa-enterprise-refresh').disabled,false);
});
test('an older page response cannot replace a refreshed reporting period',async()=>{
 let finish;
 const {context,get}=await setup(()=>new Promise(resolve=>{finish=resolve;}));
 context.render(packet());
 const pending=context.loadPage('risk',30);
 get('wa-period-from').value='2026-11-01';await context.refresh();
 finish({ok:true,status:200,json:async()=>({data:packet(30,'risk')})});
 await pending;
 assert.equal(get('wa-enterprise-grid').children.length,0);
});
test('finance clears the previous period immediately and ignores an older statement decode',async()=>{
 let decode;
 const {context,get}=await setup(async()=>({ok:true,status:200,
  json:()=>new Promise(resolve=>{decode=resolve;})}),'financial-performance.mjs');
 const pending=context.refresh();
 await new Promise(resolve=>setImmediate(resolve));
 get('wa-financial-kpis').append(new Element());
 get('wa-period-from').value='2026-11-01';await context.refresh();
 assert.equal(get('wa-financial-kpis').children.length,0);
 decode({data:{schemaVersion:'VAOS_FINANCIAL_SCORECARD_V1',readOnly:true,
  from:'2026-10-01',to:'2026-10-15'}});
 await pending;
 assert.equal(get('wa-financial-kpis').children.length,0);
 assert.match(get('wa-financial-status').textContent,/Select a valid reporting period/);
 assert.equal(get('wa-financial-refresh').disabled,false);
});
test('intelligence views preserve employee deep links and reporting controls',async()=>{
 const names=['overview','departments','team','assurance'];
 const tabs=names.map(name=>Object.assign(new Element('button'),{dataset:{premiumTab:name}}));
 const views=names.map(name=>Object.assign(new Element('div'),{dataset:{premiumView:name}}));
 const employee=new Element('select');employee.value='risk';
 let savedUrl;
 const context={document:{querySelectorAll:selector=>selector==='[data-premium-tab]'?tabs:views,
  getElementById:id=>id==='wa-period-employee'?employee:null,addEventListener(){}},
  location:{href:'https://vaos.local/workforce-analytics?employee=risk'},URL,
  history:{replaceState(_a,_b,url){savedUrl=url;}}};
 runInNewContext(await readFile(new URL('./premium.mjs',import.meta.url),'utf8'),context);
 assert.equal(views[2].hidden,false);
 assert.equal(views[0].hidden,true);
 tabs[1].handlers.click();
 assert.equal(views[1].hidden,false);assert.equal(views[2].hidden,true);
 assert.equal(savedUrl.searchParams.get('view'),'departments');
 assert.equal(savedUrl.searchParams.get('employee'),'risk');
 assert.equal(employee.value,'risk');
 employee.handlers.change();assert.equal(views[2].hidden,false);
});
