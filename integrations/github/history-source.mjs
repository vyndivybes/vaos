/** Revision-pinned, read-only GitHub codebase corpus adapter.
 * The only repositories eligible for reads are those enumerated through the
 * configured VAOS GitHub installation/user credential. Sensitive paths are
 * omitted, not presented as verified complete content.
 */
const SHA=/^[a-f0-9]{40}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_PATH=/^[A-Za-z0-9_.@/+-]{1,340}$/;
const TEXT=/\.(md|mdx|txt|mjs|js|jsx|ts|tsx|py|go|rs|java|kt|c|cc|cpp|h|hpp|css|html|sql|json|yaml|yml|toml|xml|csv|sh)$/i;
const OMIT=/(^|\/)(?:node_modules|dist|build|vendor|coverage|\.git|\.next|secrets?|credentials?|private-keys?|\.terraform|\.wrangler)(\/|$)|(^|\/)\.env(?:[./]|$)|(?:^|\/)(?:id_rsa|id_ed25519|service-account|private-key|token-store|\.npmrc)(?:\.|$)|\.(?:pem|p12|pfx|key|jks|keystore)$/i;
const BASE='https://api.github.com/';
const BATCH=8;
function fail(code){throw Error('HISTORY_GITHUB_'+code)}
async function hash(value){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,48);
}
async function fetchJSON(path,token,fetchImpl,{optional=false}={}){
 const response=await fetchImpl(BASE+path,{method:'GET',redirect:'manual',
  headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
   'X-GitHub-Api-Version':'2022-11-28','User-Agent':'VAOS-Historical-ReadOnly'},
  signal:AbortSignal.timeout(10000)});
 if(optional&&[403,404].includes(response.status))return null;
 if(response.status!==200)fail(response.status===429||response.status===403?
  'RATE_OR_PERMISSION_HOLD':'SOURCE_UNAVAILABLE');
 try{return await response.json()}catch{fail('RESPONSE_INVALID')}
}
async function inventory(token,fetchImpl){
 let strategy='installation/repositories',all=[];
 for(let page=1;page<=5;page++){
  let response=await fetchJSON(strategy+'?per_page=100&page='+page,token,fetchImpl,{optional:true});
  if(response===null&&page===1){
   strategy='user/repos';
   response=await fetchJSON(strategy+'?per_page=100&page='+page+
    '&affiliation=owner%2Ccollaborator%2Corganization_member',token,fetchImpl);
  }else if(strategy==='user/repos'){
   response=await fetchJSON(strategy+'?per_page=100&page='+page+
    '&affiliation=owner%2Ccollaborator%2Corganization_member',token,fetchImpl);
  }
  const rows=Array.isArray(response)?response:response?.repositories;
  if(!Array.isArray(rows))fail('INVENTORY_INVALID');
  all.push(...rows);
  if(rows.length<100)break;
  if(page===5)fail('INVENTORY_TRUNCATED');
 }
 const unique=new Map();
 for(const row of all){
  if(typeof row?.full_name==='string'&&REPO.test(row.full_name)&&
   typeof row.default_branch==='string'&&row.default_branch.length<=120)
   unique.set(row.full_name,{name:row.full_name,branch:row.default_branch});
 }
 return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
function cursorOf(value){
 if(value==null||value==='')return {r:0,i:0,sha:null,repo:null};
 let data;
 try{if(typeof value!=='string'||value.length>300)throw Error();data=JSON.parse(value)}catch{fail('CURSOR_INVALID')}
 if(!Number.isInteger(data?.r)||data.r<0||data.r>500||!Number.isInteger(data.i)||
  data.i<0||data.i>100000||data.sha!==null&&data.sha!==undefined&&!SHA.test(data.sha)||
  typeof data.repo!=='string'||!REPO.test(data.repo))fail('CURSOR_INVALID');
 return data;
}
function validBlob(row){
 return row?.type==='blob'&&typeof row.path==='string'&&SAFE_PATH.test(row.path)&&
  !row.path.split('/').some(x=>x==='..'||x==='.')&&!OMIT.test(row.path)&&
  Number.isInteger(row.size)&&row.size>=0&&row.size<100000000;
}
function contentBytes(raw){
 if(raw?.encoding!=='base64'||typeof raw.content!=='string'||raw.content.length>150000)return null;
 try{
  const binary=atob(raw.content.replace(/\s/g,''));
  const data=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return new TextDecoder('utf-8',{fatal:true}).decode(data);
 }catch{return null}
}
async function getPinnedRepoCommit(repo,token,fetchImpl){
 const result=await fetchJSON('repos/'+repo.name+'/git/ref/heads/'+
  encodeURIComponent(repo.branch),token,fetchImpl);
 if(!SHA.test(result?.object?.sha||''))fail('REVISION_INVALID');
 return result.object.sha;
}
export async function readGitHubHistoryPage({token,cursor=null,fetchImpl=globalThis.fetch}={}){
 if(typeof token!=='string'||token.length<20)fail('CREDENTIAL_UNAVAILABLE');
 const state=cursorOf(cursor),repos=await inventory(token,fetchImpl);
 if(state.r>=repos.length)return {source:'github',records:[],nextCursor:null,complete:true,
  readOnly:true,actionAuthorized:false};
 const repo=repos[state.r];
 if(state.repo&&state.repo!==repo.name)fail('INVENTORY_CHANGED');
 const commit=state.sha||await getPinnedRepoCommit(repo,token,fetchImpl);
 const tree=await fetchJSON('repos/'+repo.name+'/git/trees/'+commit+'?recursive=1',token,fetchImpl);
 if(tree?.truncated!==false||!Array.isArray(tree.tree))fail('TREE_TRUNCATED');
 const files=tree.tree.filter(validBlob).sort((a,b)=>a.path.localeCompare(b.path));
 const part=files.slice(state.i,state.i+BATCH);
 const repoId='r'+await hash(repo.name);
 const records=[];
 if(state.i===0)records.push({id:repoId,title:repo.name,body:'',
  kind:'repository',sourceRef:'github:'+repo.name+'@'+commit,
  modifiedAt:null,complete:false,links:[]});
 for(const file of part){
  const id='f'+await hash(repo.name+':'+file.path);
  let body='',complete=false;
  if(TEXT.test(file.path)&&file.size<=60000){
   const raw=await fetchJSON('repos/'+repo.name+'/contents/'+
    file.path.split('/').map(encodeURIComponent).join('/')+'?ref='+commit,token,fetchImpl);
   if(raw?.sha!==file.sha)fail('CONTENT_REVISION_MISMATCH');
   const decoded=contentBytes(raw);
   if(decoded!==null){
    body=decoded.replace(/\u0000/g,'').slice(0,64000);
    complete=decoded.length<=64000;
   }
  }
  records.push({id,title:file.path.slice(0,220),body,
   sourceRef:('github:'+repo.name+'/'+file.path+'@'+file.sha).slice(0,420),
   kind:TEXT.test(file.path)?'source_file':'binary_metadata',modifiedAt:null,
   complete,links:[{targetId:repoId,relation:'PART_OF'}]});
 }
 const finishedRepo=state.i+part.length>=files.length;
 const finishedAll=finishedRepo&&state.r+1>=repos.length;
 const nextCursor=finishedAll?null:JSON.stringify(finishedRepo?
  {r:state.r+1,i:0,sha:null,repo:repos[state.r+1].name}:
  {r:state.r,i:state.i+part.length,sha:commit,repo:repo.name});
 return {source:'github',records,nextCursor,complete:finishedAll,
  readOnly:true,actionAuthorized:false,sourceRevision:commit,
  observedRepositories:repos.length};
}
