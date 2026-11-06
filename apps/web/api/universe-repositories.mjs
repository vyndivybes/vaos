/** Founder-only read of repository names visible to VAOS's GitHub credential.
 * No source files, secrets, private branches, or repository bodies are ingested.
 * An installation credential and a user-scoped token have different visibility;
 * the result must not claim to represent accounts that were not authorized.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {apiError} from '../lib/api-contracts.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const NAME=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export function normalizeRepositoryInventory(rows){
 if(!Array.isArray(rows))return [];
 const seen=new Set(),results=[];
 for(const item of rows.slice(0,500)){
  const name=item?.full_name;
  if(typeof name!=='string'||name.length>180||!NAME.test(name)||seen.has(name))continue;
  seen.add(name);
  results.push({
   fullName:name,owner:name.split('/')[0],
   isPrivate:item.private===true,
   defaultBranch:typeof item.default_branch==='string'&&item.default_branch.length<100?item.default_branch:null,
   lastUpdated:typeof item.updated_at==='string'&&Number.isFinite(Date.parse(item.updated_at))?new Date(item.updated_at).toISOString():null
  });
 }
 return results;
}
async function listProvider(endpoint,token,fetchImpl){
 const repositories=[];let truncated=false;
 for(let page=1;page<=5;page++){
  const url='https://api.github.com/'+endpoint+(endpoint.includes('?')?'&':'?')+'per_page=100&page='+page;
  const response=await fetchImpl(url,{method:'GET',headers:{
   Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
   'X-GitHub-Api-Version':'2022-11-28','User-Agent':'VAOS-ReadOnly-Knowledge'
  },redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!response.ok){
   if(page===1&&(response.status===403||response.status===404))return null;
   throw Error('GITHUB_INVENTORY_UNAVAILABLE');
  }
  const body=await response.json();
  const rows=Array.isArray(body)?body:body?.repositories;
  if(!Array.isArray(rows))throw Error('GITHUB_INVENTORY_INVALID');
  repositories.push(...rows);
  if(rows.length<100)return {repositories,truncated:false};
  if(page===5)truncated=true;
 }
 return {repositories,truncated};
}
export function createUniverseRepositoriesHandler({fetchImpl=globalThis.fetch,now=()=>new Date()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder authentication required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  if(featureControl(req.env||{},'VAOS_FEDERATED_KNOWLEDGE_CONTROL')!=='founder-readonly-v1')
   return res.status(409).json(apiError('SOURCE_NOT_COMMISSIONED','Federated repository access disabled'));
  try{
   const query=new URL(req.url,'https://vaos.local').searchParams;
   if(query.size)return res.status(422).json(apiError('QUERY_DENIED','This resource accepts no query parameters'));
  }catch{return res.status(422).json(apiError('QUERY_DENIED','Invalid request'));}
  const token=req.env?.VAOS_FEDERATED_GITHUB_TOKEN;
  if(typeof token!=='string'||token.length<20)
   return res.status(503).json(apiError('GITHUB_CREDENTIAL_HOLD','Founder-scoped GitHub source is not configured'));
  try{
   // GitHub App installation tokens expose installation/repositories;
   // user-scoped fine-grained tokens expose user/repos instead.
   const discovery=(await listProvider('installation/repositories',token,fetchImpl))||
    (await listProvider('user/repos?affiliation=owner%2Ccollaborator%2Corganization_member',token,fetchImpl));
   if(!discovery)throw Error('CREDENTIAL_SCOPE_UNSUPPORTED');
   const repos=normalizeRepositoryInventory(discovery.repositories);
   return res.status(200).json({data:{
    schemaVersion:'VAOS_GITHUB_REPOSITORY_INVENTORY_V1',
    status:'OBSERVED',readOnly:true,actionAuthorized:false,
    scope:'REPOSITORIES_VISIBLE_TO_CONFIGURED_CREDENTIAL',
    observedAt:now().toISOString(),
    repositories:repos,truncated:discovery.truncated===true
   }});
  }catch{return res.status(503).json(apiError('GITHUB_REPOSITORY_INVENTORY_HOLD','Repository inventory read unavailable'));}
 };
}
export default createUniverseRepositoriesHandler();
