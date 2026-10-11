import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const SOURCES=Object.freeze(['vayu-shastr/veloxis-engineering-design-manual','vyndivybes/vyndios','vyndivybes/vaos']);
const QUERY=/^[A-Za-z0-9][A-Za-z0-9 _.-]{3,119}$/;
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
  const results=[],failed=[],failures=[];
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
   }catch(error){failed.push(repo);failures.push({repository:repo,code:['UNAUTHORIZED','FORBIDDEN_OR_RATE_LIMITED','NOT_FOUND','QUERY_UNPROCESSABLE','RATE_LIMITED','UPSTREAM_HTTP_ERROR','GITHUB_INVALID'].includes(error?.message)?error.message:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK_OR_PROVIDER_ERROR'});}
  }
  return res.status(failed.length===SOURCES.length?503:200).json({data:{scope:'ALLOWLISTED_GITHUB_CODE_METADATA',readOnly:true,
    actionAuthorized:false,sourceCount:SOURCES.length,results,failedSources:failed,sourceFailures:failures,
    answer:results.length?'Found '+results.length+' source files. File metadata is not proof of engineering approval.':
      'No indexed source files found. Some repositories may be inaccessible or unindexed.',
    evidenceQualified:false}});
 };
}
export default createFederatedKnowledgeHandler();
