import {mountBiStudio} from './bi-studio.mjs';
async function request(path,options){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const b=await r.json();if(!r.ok)throw Error(b.error?.message||'Source unavailable');return b.data;}
const host=document.getElementById('business-intelligence');
if(host)mountBiStudio(host,{
 read:async d=>{
  if(d.metric==='agents')return {enterprise:null,workforce:await request('/api/workforce-analytics')};
  // Reuse the existing signed, founder-authorized read bridge.
  const packets=[];for(const employee of d.agents)packets.push(await request('/api/enterprise-bi?'+new URLSearchParams({from:d.from,to:d.to,employee,limit:'5',primary:'1',...(d.metric==='crm'?{crm:'1'}:{})})));
  return {enterprise:{...packets[0],departments:packets.flatMap(p=>p.departments)},workforce:null};
 },
 list:()=>request('/api/dashboards'),open:id=>request('/api/dashboards?id='+encodeURIComponent(id)),
 save:data=>request('/api/dashboards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
});
