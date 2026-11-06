/** Curated, content-addressed Graphify/Graphiti/Wiki/Atlas snapshots.
 * Never accepts a user-supplied bucket key, URL, or arbitrary Cloudflare object.
 */
const SNAPSHOTS=Object.freeze(['graphify','graphiti','llm-wiki','brain-atlas','obsidian','dify']);
const HASH=/^[a-f0-9]{64}$/;
const MAX_BYTES=350_000;
function fail(code){const e=new Error('NEURAL_'+code);e.code='NEURAL_'+code;e.retryable=false;throw e}
function sha256(bytes){return crypto.subtle.digest('SHA-256',bytes).then(b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join(''))}
export function readPinnedSnapshotHashes(env){
 let raw=env?.VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES;
 if(raw===undefined){
  const bundled=env?.VAOS_FEATURE_FLAGS;
  if(typeof bundled!=='string'||bundled.length>4096)return null;
  try{
   const flags=JSON.parse(bundled);
   if(!flags||typeof flags!=='object'||Array.isArray(flags))return null;
   raw=flags.VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES;
  }catch{return null}
 }
 if(typeof raw!=='string'||raw.length>1024)return null;
 try{
  const hashes=JSON.parse(raw);
  return hashes&&typeof hashes==='object'&&!Array.isArray(hashes)?hashes:null;
 }catch{return null}
}
export async function loadApprovedGraphSnapshot({env,sourceType}={}){
 if(!SNAPSHOTS.includes(sourceType))fail('SNAPSHOT_SOURCE_DENIED');
 const config=readPinnedSnapshotHashes(env);
 if(!config||typeof config!=='object'||Array.isArray(config)||!HASH.test(config[sourceType]||'')
    ||typeof env?.VAOS_ARTIFACTS?.get!=='function')fail('SNAPSHOT_NOT_COMMISSIONED');
 const key='knowledge/neutral-v1/'+sourceType+'.json';
 let object;
 try{object=await env.VAOS_ARTIFACTS.get(key)}catch{fail('SNAPSHOT_SOURCE_UNAVAILABLE')}
 if(!object)fail('SNAPSHOT_SOURCE_UNAVAILABLE');
 if(!Number.isInteger(object.size)||object.size<1||object.size>MAX_BYTES)fail('SNAPSHOT_SIZE_DENIED');
 let raw;
 try{raw=await object.text()}catch{fail('SNAPSHOT_SOURCE_UNAVAILABLE')}
 if(typeof raw!=='string')fail('SNAPSHOT_SOURCE_INVALID');
 const bytes=new TextEncoder().encode(raw);
 if(bytes.length!==object.size||bytes.length>MAX_BYTES)fail('SNAPSHOT_SIZE_DENIED');
 if((await sha256(bytes))!==config[sourceType])fail('SNAPSHOT_INTEGRITY_HOLD');
 let snapshot;
 try{snapshot=JSON.parse(raw)}catch{fail('SNAPSHOT_SOURCE_INVALID')}
 if(!snapshot||snapshot.schemaVersion!=='VAOS_NEUTRAL_GRAPH_SOURCE_V1'||snapshot.sourceType!==sourceType)fail('SNAPSHOT_SOURCE_INVALID');
 return Object.freeze({snapshot,integrityVerified:true,key});
}
