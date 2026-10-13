/** VAOS Worker Preview retention. Never delete production, active PRs, or nonempty state. */
const REPO = 'vyndivybes/vaos';
const WORKER = 'vaos';
const HOURS = 6;
const CLASS_NAMES = new Set(['ActivepiecesMcpHandshake','WindmillAdmissionCoordinator']);
const LIMIT = 15;
const cutoff = now => now - HOURS * 3600_000;
const oldEnough = (date, now) => typeof date === 'string' && Number.isFinite(Date.parse(date)) && Date.parse(date) < cutoff(now);
const internalRef = pr => pr?.head?.repo?.full_name === REPO && typeof pr?.head?.ref === 'string' ? pr.head.ref : null;

export function eligiblePreviews({previews,closed,open,now}) {
  const active = new Set(open.map(internalRef).filter(Boolean));
  const merged = new Set(closed.filter(pr => pr?.merged_at && oldEnough(pr.merged_at,now)).map(internalRef).filter(Boolean));
  return previews.filter(p => p?.id && p?.name && p?.slug &&
    merged.has(p.name) && !active.has(p.name) &&
    oldEnough(p.created_on, now) && oldEnough(p.updated_on, now) &&
    (!p.deployed_on || oldEnough(p.deployed_on, now)))
    .sort((a,b)=>Date.parse(a.created_on)-Date.parse(b.created_on))
    .slice(0,LIMIT);
}

export async function cleanupPreviews({previews,namespaces,closed,open,now,apply,cf,accountId='ACCOUNT'}) {
 const eligible=eligiblePreviews({previews,closed,open,now});
 const result={planned:eligible.map(x=>x.name),deleted:[],skipped:[]};
 if(!apply) return result;
 for(const p of eligible){
  const expectedPrefix = `vaos_${p.slug}_`;
  const hits=namespaces.filter(n=>n.script===WORKER && n.name?.startsWith(expectedPrefix));
  if(p.deployed_on){
   if(hits.length!==2 || hits.some(n=>!CLASS_NAMES.has(n.name.slice(expectedPrefix.length)))) {
    result.skipped.push({name:p.name,reason:'unexpected Durable Object namespace layout'});continue;
   }
   let empty=true;
   for(const ns of hits){
    const r=await cf('GET',`/accounts/${accountId}/workers/durable_objects/namespaces/${encodeURIComponent(ns.id)}/objects`);
    if(!r?.success || !Array.isArray(r.result) || r.result.length || r.result_info?.cursors?.after){empty=false;break;}
   }
   if(!empty){result.skipped.push({name:p.name,reason:'Durable Object state is present or unverifiable'});continue;}
  }else if(hits.length){result.skipped.push({name:p.name,reason:'undeployed preview unexpectedly owns a namespace'});continue;}
  // No force parameter. Cloudflare must reject any preview still referenced by another Worker.
  const r=await cf('DELETE',`/accounts/${accountId}/workers/workers/${WORKER}/previews/${encodeURIComponent(p.id)}`);
  if(!r?.success){result.skipped.push({name:p.name,reason:'Cloudflare rejected non-forced deletion'});continue;}
  result.deleted.push(p.name);
 }
 return result;
}

async function fetchJson(url,headers,method='GET',fetchImpl=fetch) {
 const response = await fetchImpl(url,{method,headers});
 if(!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
 const data=await response.json();
 if(data?.success===false)throw new Error(`Cloudflare request rejected: ${new URL(url).pathname}`);
 return data;
}
async function paged(url,headers,key,maxPages=15) {
 const out=[];
 for(let page=1;page<=maxPages;page++) {
  const u = new URL(url);u.searchParams.set('page',String(page));u.searchParams.set('per_page','100');
  const data=await fetchJson(u,headers);
  const values=key==='array'?data:data[key];
  if(!Array.isArray(values))throw new Error('Unexpected paginated response schema');
  out.push(...values);
  if(values.length<100)return out;
 }
 throw new Error('Pagination was incomplete; fail closed');
}
async function main(){
 if(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REPOSITORY!==REPO)throw new Error('Untrusted repository/ref; cleanup disabled');
 const account=process.env.CLOUDFLARE_ACCOUNT_ID;
 const token=process.env.CLOUDFLARE_API_TOKEN;
 const gh=process.env.GITHUB_TOKEN;
 if(!account||!token||!gh)throw new Error('Missing Cloudflare/GitHub authorization; cleanup disabled');
 const cHeaders={Authorization:`Bearer ${token}`};
 const gHeaders={Authorization:`Bearer ${gh}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
 const cf=(method,path)=>fetchJson(`https://api.cloudflare.com/client/v4${path}`,{...cHeaders,'Content-Type':'application/json'},method);
 const [previews,namespaces,closed,open]=await Promise.all([
   paged(`${base}/workers/workers/${WORKER}/previews`,cHeaders,'result'),
   paged(`${base}/workers/durable_objects/namespaces`,cHeaders,'result'),
   paged(`https://api.github.com/repos/${REPO}/pulls?state=closed&sort=updated&direction=desc`,gHeaders,'array'),
   paged(`https://api.github.com/repos/${REPO}/pulls?state=open&sort=updated&direction=desc`,gHeaders,'array')
 ]);
 const apply=process.env.CLEANUP_APPLY==='true';
 const result=await cleanupPreviews({previews,namespaces,closed,open,now:Date.now(),apply,cf,accountId:account});
 console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',previewCount:previews.length,namespaceCount:namespaces.length,...result},null,2));
 if(result.skipped.some(x=>x.reason==='Cloudflare rejected non-forced deletion'))process.exitCode=1;
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href) {
 main().catch(err=>{console.error(`VAOS_PREVIEW_CLEANUP_HOLD: ${err.message}`);process.exitCode=1;});
}
