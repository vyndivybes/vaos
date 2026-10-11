import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const SOURCES=Object.freeze(['vayu-shastr/veloxis-engineering-design-manual','vyndivybes/vyndios','vyndivybes/vaos']);
const QUERY=/^[A-Za-z0-9][A-Za-z0-9 _.-]{3,119}$/;

// Bounded repository-tree fallback: does not depend on GitHub code-search indexing.
const DOC=/\.(md|mdx|txt|json|ya?ml)$/i;
const STOP=new Set(['what','with','from','status','current','about','latest','update','please','show','tell','give','the','and','for']);
function tokens(q){return [...new Set((q.toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(x=>!STOP.has(x)))];}
async function retrieveDocuments(repo,q,token,fetchImpl){
 const headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,
  'X-GitHub-Api-Version':'2022-11-28','User-Agent':'VAOS-Federated-ReadOnly'};
 const get=async(path)=>{const r=await fetchImpl('https://api.github.com/repos/'+repo+path,{
  method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw Error('GITHUB_STATUS_'+r.status);
  return r.json();};
 const meta=await get('');
 const branch=meta.default_branch;
 if(typeof branch!=='string'||!branch||branch.length>100)throw Error('INVALID_BRANCH');
 const tree=await get('/git/trees/'+encodeURIComponent(branch)+'?recursive=1');
 if(!Array.isArray(tree.tree))throw Error('INVALID_TREE');
 const terms=tokens(q);
 const candidates=tree.tree.filter(x=>x.type==='blob'&&typeof x.path==='string'&&
  x.path.length<260&&DOC.test(x.path)&&!/(^|\/)(node_modules|dist|build|vendor|\.git)\//.test(x.path)&&
  Number.isInteger(x.size)&&x.size>0&&x.size<=60000)
  .map(x=>({path:x.path,sha:x.sha,score:terms.filter(t=>x.path.toLowerCase().includes(t)).length}))
  .sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,12);
 const evidence=[];
 for(const item of candidates.slice(0,4)){
  const raw=await get('/contents/'+item.path.split('/').map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(branch));
  if(raw.encoding!=='base64'||typeof raw.content!=='string'||raw.size>60000)continue;
  const bytes=Uint8Array.from(atob(raw.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
  const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const lines=content.split(/\r?\n/);
  const hits=[];
  for(let i=0;i<lines.length;i++){
   const score=terms.filter(t=>lines[i].toLowerCase().includes(t)).length;
   if(score>0)hits.push({line:i+1,score,text:lines[i].trim().slice(0,220)});
  }
  hits.sort((a,b)=>b.score-a.score||a.line-b.line);
  if(hits.length) evidence.push({repository:repo,path:item.path,sha:item.sha,
   url:'https://github.com/'+repo+'/blob/'+encodeURIComponent(item.sha)+'/'+item.path.split('/').map(encodeURIComponent).join('/'),
   excerpts:hits.slice(0,3).map(({line,text})=>({line,text}))});
 }
 return {evidence,truncated:tree.truncated===true};
}

export function createFederatedKnowledgeHandler({fetchImpl=globalThis.fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  if(req.env?.VAOS_FEDERATED_KNOWLEDGE_CONTROL!=='founder-readonly-v1')
    return res.status(409).json(apiError('FEDERATED_DISABLED','Federated gateway not commissioned'));
  let q;try{q=new URL(req.url).searchParams.get('q');}catch{}
  if(!QUERY.test(q||'')||/\b(password|secret|token|credentials|private key|api key)\b/i.test(q))
    return res.status(422).json(apiError('QUERY_REJECTED','Bounded non-secret search required'));
  const token=req.env?.VAOS_FEDERATED_GITHUB_TOKEN;
  if(typeof token!=='string'||token.length<20)
    return res.status(503).json(apiError('SOURCE_CREDENTIAL_UNAVAILABLE','Read-only GitHub credential missing'));
  const results=[],failed=[],failures=[],evidence=[],truncatedSources=[];
  for(const repo of SOURCES){
   try{
    const query=encodeURIComponent(q+' repo:'+repo);
    const response=await fetchImpl('https://api.github.com/search/code?q='+query+'&per_page=5',{
      method:'GET',headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,
       'X-GitHub-Api-Version':'2022-11-28','User-Agent':'VAOS-Federated-ReadOnly'},
      redirect:'manual',signal:AbortSignal.timeout(6000),
    });
    if(!response.ok)throw Error(response.status===401?'UNAUTHORIZED':response.status===403?'FORBIDDEN_OR_RATE_LIMITED':response.status===404?'NOT_FOUND':response.status===422?'QUERY_UNPROCESSABLE':response.status===429?'RATE_LIMITED':'UPSTREAM_HTTP_ERROR');
    const data=await response.json();
    if(!Array.isArray(data?.items))throw Error('GITHUB_INVALID');
    for(const item of data.items.slice(0,5)){
      if(item.repository?.full_name!==repo||typeof item.path!=='string'
        ||item.path.length>300||!(/^[a-f0-9]{40}$/.test(item.sha||'')))continue;
      results.push({repository:repo,path:item.path,sha:item.sha,
        url:'https://github.com/'+repo+'/blob/'+encodeURIComponent(item.sha)+'/'+item.path.split('/').map(encodeURIComponent).join('/')});
    }
    // Content evidence discovery is independent of code-search indexing.
    const documents=await retrieveDocuments(repo,q,token,fetchImpl);
    evidence.push(...documents.evidence);
    if(documents.truncated)truncatedSources.push(repo);
   }catch(error){failed.push(repo);failures.push({repository:repo,code:['UNAUTHORIZED','FORBIDDEN_OR_RATE_LIMITED','NOT_FOUND','QUERY_UNPROCESSABLE','RATE_LIMITED','UPSTREAM_HTTP_ERROR','GITHUB_INVALID'].includes(error?.message)?error.message:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK_OR_PROVIDER_ERROR'});}
  }
  return res.status(failed.length===SOURCES.length?503:200).json({data:{scope:'ALLOWLISTED_GITHUB_CODE_METADATA',readOnly:true,
    actionAuthorized:false,sourceCount:SOURCES.length,results,failedSources:failed,sourceFailures:failures,evidence,truncatedSources,
    answer:evidence.length?'Retrieved '+evidence.length+' source documents containing relevant excerpts; review source links before drawing conclusions.':results.length?'Found '+results.length+' source files. File metadata is not proof of engineering approval.':
      'No indexed source files found. Some repositories may be inaccessible or unindexed.',
    evidenceQualified:false}});
 };
}
export default createFederatedKnowledgeHandler();
