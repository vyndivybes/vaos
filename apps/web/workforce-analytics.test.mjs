import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {buildWorkforceAnalytics} from '../../intelligence/workforce-analytics.mjs';
const source=await readFile(new URL('./workforce-analytics.mjs',import.meta.url),'utf8');
const html=await readFile(new URL('./workforce-analytics.html',import.meta.url),'utf8');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.events={};this._text='';}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this._text='';this.children=items;}
 setAttribute(){}
 addEventListener(name,fn){this.events[name]=fn;}
 set innerHTML(value){throw Error('Unsafe HTML interpolation: '+value);}
}
const raw={schemaVersion:'VAOS_WORKFORCE_OVERVIEW_V1',readOnly:true,observedAt:'2026-10-13T10:00:00Z',employees:[{
 id:'qa',name:'QA fixture',work:{planned:0,ready:0,inProgress:0,completed:1,blocked:0,failed:0,cancelled:0,total:1},
 workItems:[{id:'wp1',missionId:'<img src=x onerror=attack()>',actionType:'QA.CHECK',status:'COMPLETED',updatedAt:'2026-10-12T00:00:00Z'}],
 verifiedClosures:[],departmentReviews:[],planBaselines:[],forecastQualifications:[],capaCounts:{OPEN:1},capaCases:[{id:'c1',status:'OPEN',openedAt:'2026-10-10T00:00:00Z'}],capaEvents:[],employeeReports:[]
}]};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('employee selection renders unknown evidence as holds and failed refresh removes stale details',async()=>{
 const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element('div')]));
 let fail=false;
 const document={getElementById:id=>{assert.ok(nodes.has(id),'HTML contains '+id);return nodes.get(id);},createElement:tag=>new Element(tag)};
 runInNewContext(source,{document,fetch:async()=>fail?{ok:false,status:503}:{ok:true,status:200,json:async()=>({data:buildWorkforceAnalytics(raw)})},location:{assign(){throw Error('Unexpected redirect');}},Date,URL,Math,Number,String,Object});
 await flush();
 nodes.get('wa-select').events.change({target:{value:'qa'}});
 assert.match(nodes.get('wa-profile').textContent,/QA fixture/);
 assert.match(nodes.get('wa-forecast').textContent,/NOT_QUALIFIED/);
 assert.match(nodes.get('wa-progress-coverage').textContent,/NO_APPROVED_BASELINE/);
 assert.match(nodes.get('wa-report-status').textContent,/NO_VERIFIED_EMPLOYEE_REPORTS/);
 assert.match(nodes.get('wa-work').textContent,/<img src=x onerror=attack\(\)>/,'untrusted text rendered literally');
 fail=true;await nodes.get('wa-refresh').events.click();await flush();
 assert.match(nodes.get('wa-status').textContent,/source unavailable/);
 for(const id of ['wa-profile','wa-work','wa-forecast','wa-capa-cases','wa-audit-pages','wa-progress','wa-reports'])
  assert.equal(nodes.get(id).textContent,'',id+' must not retain stale metrics');
 assert.equal(nodes.get('wa-refresh').disabled,false);
});
