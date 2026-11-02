import {createHash,randomUUID} from 'node:crypto';

const DAY=86400000;
const defaults=Object.freeze({retentionDays:60,recallEnabled:true,importEnabled:true});
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>{throw Error(code);};
function string(value,max){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail('MEMORY_INPUT_INVALID');return value;}
function policy(value){
 if(!value||Object.keys(value).sort().join(',')!=='importEnabled,recallEnabled,retentionDays'||!Number.isInteger(value.retentionDays)||value.retentionDays<1||value.retentionDays>365||typeof value.recallEnabled!=='boolean'||typeof value.importEnabled!=='boolean')fail('MEMORY_POLICY_INVALID');
 return {retentionDays:value.retentionDays,recallEnabled:value.recallEnabled,importEnabled:value.importEnabled};
}
// Only supplied text is read. No URLs, attachments, private history or tools are fetched.
export function normalizeArchive(archive){
 let rows=[];
 if(archive?.schemaVersion===1&&Array.isArray(archive.messages))rows=archive.messages;
 else if(Array.isArray(archive)){
  if(archive.length>100)fail('MEMORY_ARCHIVE_TOO_LARGE');
  for(const chat of archive){
   string(chat.id,200);string(chat.current_node,200);
   const seen=new Set(),branch=[];let node=chat.current_node;
   while(node){
    if(seen.has(node)||seen.size>=2000)fail('MEMORY_ARCHIVE_INVALID');seen.add(node);
    const item=chat.mapping?.[node];if(!item)fail('MEMORY_ARCHIVE_INVALID');
    const m=item.message;
    if(m&&['user','assistant'].includes(m.author?.role)&&m.content?.content_type==='text'){
     if(!Array.isArray(m.content.parts)||!m.content.parts.every(p=>typeof p==='string'))fail('MEMORY_ARCHIVE_INVALID');
     if(m.content.parts.join('\n').trim())branch.push({conversationId:chat.id,messageId:m.id,role:m.author.role,text:m.content.parts.join('\n'),createdAt:new Date(m.create_time*1000).toISOString()});
    }
    node=item.parent;
   }
   rows.push(...branch.reverse());
  }
 }else fail('MEMORY_ARCHIVE_INVALID');
 if(!rows.length||rows.length>2000)fail('MEMORY_ARCHIVE_TOO_LARGE');
 const ids=new Set();
 return rows.map(m=>{
  const row={conversationId:string(m.conversationId,200),messageId:string(m.messageId,200),role:m.role,text:string(m.text,12000),createdAt:m.createdAt};
  if(!['user','assistant'].includes(row.role)||typeof row.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(row.createdAt)||!Number.isFinite(Date.parse(row.createdAt)))fail('MEMORY_MESSAGE_INVALID');
  row.createdAt=new Date(row.createdAt).toISOString();
  const key=JSON.stringify([row.conversationId,row.messageId]);if(ids.has(key))fail('MEMORY_DUPLICATE_SOURCE');ids.add(key);return row;
 });
}

export function createConversationMemory(db,{now=()=>Date.now()}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS conversation_policy(tenant TEXT PRIMARY KEY,version INTEGER NOT NULL,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS conversation_messages(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,conversation TEXT NOT NULL,message TEXT NOT NULL,role TEXT NOT NULL,body TEXT NOT NULL,sourceTime INTEGER NOT NULL,expires INTEGER NOT NULL,provenance TEXT NOT NULL,UNIQUE(tenant,conversation,message));
 CREATE INDEX IF NOT EXISTS conversation_scope ON conversation_messages(tenant,expires);
 CREATE TABLE IF NOT EXISTS conversation_reviews(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,subject TEXT NOT NULL,kind TEXT NOT NULL,version INTEGER NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS conversation_audit(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,subject TEXT NOT NULL,event TEXT NOT NULL,reference TEXT NOT NULL,at INTEGER NOT NULL);
 CREATE VIRTUAL TABLE IF NOT EXISTS conversation_search USING fts5(body,content='conversation_messages',content_rowid='rowid');
 CREATE TRIGGER IF NOT EXISTS conversation_insert AFTER INSERT ON conversation_messages BEGIN INSERT INTO conversation_search(rowid,body) VALUES(new.rowid,new.body); END;
 CREATE TRIGGER IF NOT EXISTS conversation_delete AFTER DELETE ON conversation_messages BEGIN INSERT INTO conversation_search(conversation_search,rowid,body) VALUES('delete',old.rowid,old.body); END;`);
 function scope(principal){if(!principal||!['owner','reader'].includes(principal.role))fail('MEMORY_ACCESS_DENIED');string(principal.tenantId,100);string(principal.subject,100);return principal;}
 function owner(p){scope(p);if(p.role!=='owner')fail('MEMORY_OWNER_REQUIRED');}
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 db.prepare("INSERT INTO conversation_search(conversation_search,rank) VALUES('secure-delete',1)").run();
 function audit(p,event,reference){db.prepare('INSERT INTO conversation_audit VALUES(?,?,?,?,?,?)').run(randomUUID(),p.tenantId,p.subject,event,reference,now());}
 function getPolicy(p){scope(p);const row=db.prepare('SELECT * FROM conversation_policy WHERE tenant=?').get(p.tenantId);return row?{version:row.version,...JSON.parse(row.value)}:{version:0,...defaults};}
 function sweep(){
  // Called on startup, every minute, and before every memory request. Expiry removes
  // both original text and the FTS index, rather than merely hiding results.
  transaction(()=>{
   db.prepare('DELETE FROM conversation_messages WHERE expires<=?').run(now());
   db.prepare('DELETE FROM conversation_reviews WHERE expires<=?').run(now());
   db.prepare('DELETE FROM conversation_audit WHERE at<=?').run(now()-30*DAY);
  });
 }
 function prepare(p,kind,payload){
  owner(p);sweep();const current=getPolicy(p),id=randomUUID(),expiresAt=now()+15*60000;
  const hash=digest({tenant:p.tenantId,subject:p.subject,kind,version:current.version,payload});
  if(db.prepare('SELECT count(*) AS n FROM conversation_reviews WHERE tenant=?').get(p.tenantId).n>=20)fail('MEMORY_REVIEW_LIMIT');
  db.prepare('INSERT INTO conversation_reviews VALUES(?,?,?,?,?,?,?,?)').run(id,p.tenantId,p.subject,kind,current.version,hash,JSON.stringify(payload),expiresAt);
  return {id,hash,kind,version:current.version,expiresAt,review:payload,actionAuthorized:false};
 }
 function prepareImport(p,{archive,sourceLabel}){
  owner(p);const current=getPolicy(p);if(!current.importEnabled)fail('MEMORY_IMPORT_DISABLED');
  const rows=normalizeArchive(archive);string(sourceLabel,200);
  for(const row of rows)if(Date.parse(row.createdAt)>now()+60000)fail('MEMORY_FUTURE_SOURCE');
  return prepare(p,'import',{sourceLabel,archiveHash:digest(archive),messages:rows});
 }
 function approve(p,{id,hash,confirm}){
  owner(p);sweep();if(confirm!=='APPROVE REVIEWED MEMORY CHANGE')fail('MEMORY_CONFIRMATION_REQUIRED');
  return transaction(()=>{
   const review=db.prepare('SELECT * FROM conversation_reviews WHERE id=? AND tenant=? AND subject=?').get(id,p.tenantId,p.subject);
   if(!review||review.hash!==hash)fail('MEMORY_REVIEW_INVALID');
   const current=getPolicy(p);if(current.version!==review.version)fail('MEMORY_POLICY_CONFLICT');
   const payload=JSON.parse(review.payload);
   let result;
   if(review.kind==='policy'){
    const next=policy(payload),version=current.version+1;
    db.prepare('INSERT INTO conversation_policy VALUES(?,?,?) ON CONFLICT(tenant) DO UPDATE SET version=excluded.version,value=excluded.value').run(p.tenantId,version,JSON.stringify(next));
    // Extending retention never extends already stored rows; shortening applies now.
    db.prepare('UPDATE conversation_messages SET expires=min(expires,sourceTime+?) WHERE tenant=?').run(next.retentionDays*DAY,p.tenantId);
    db.prepare('DELETE FROM conversation_messages WHERE tenant=? AND expires<=?').run(p.tenantId,now());
    result={version,...next};
   }else if(review.kind==='import'){
    if(!current.importEnabled)fail('MEMORY_IMPORT_DISABLED');
    let imported=0,expired=0,duplicates=0;
    for(const m of payload.messages){
     const sourceTime=Date.parse(m.createdAt),expires=sourceTime+current.retentionDays*DAY;
     if(expires<=now()){expired++;continue;}
     const existing=db.prepare('SELECT role,body,sourceTime FROM conversation_messages WHERE tenant=? AND conversation=? AND message=?').get(p.tenantId,m.conversationId,m.messageId);
     if(existing){if(existing.role!==m.role||existing.body!==m.text||existing.sourceTime!==sourceTime)fail('MEMORY_SOURCE_CONFLICT');duplicates++;continue;}
     const provenance={sourceLabel:payload.sourceLabel,archiveHash:payload.archiveHash,contentHash:digest(m),importedAt:now(),authorizedBy:p.subject,reviewHash:hash,authority:'USER_SUPPLIED_UNVERIFIED'};
     db.prepare('INSERT INTO conversation_messages VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),p.tenantId,m.conversationId,m.messageId,m.role,m.text,sourceTime,expires,JSON.stringify(provenance));imported++;
    }
    result={imported,expired,duplicates};
   }else fail('MEMORY_REVIEW_INVALID');
   db.prepare('DELETE FROM conversation_reviews WHERE id=?').run(id);audit(p,review.kind+'.approved',id);
   return {...result,actionAuthorized:false};
  });
 }
 function recall(p,q=''){
  scope(p);sweep();if(!getPolicy(p).recallEnabled)fail('MEMORY_RECALL_DISABLED');
  if(typeof q!=='string'||q.length>200)fail('MEMORY_QUERY_INVALID');
  const terms=q.match(/[\p{L}\p{N}]+/gu)?.slice(0,12)||[];
  const rows=terms.length?db.prepare(`SELECT m.* FROM conversation_search s JOIN conversation_messages m ON m.rowid=s.rowid WHERE conversation_search MATCH ? AND m.tenant=? AND m.expires>? ORDER BY m.sourceTime DESC,m.id LIMIT 20`).all(terms.map(t=>'"'+t+'"').join(' AND '),p.tenantId,now()):db.prepare('SELECT * FROM conversation_messages WHERE tenant=? AND expires>? ORDER BY sourceTime DESC,id LIMIT 20').all(p.tenantId,now());
  return {authority:'UNTRUSTED_HISTORICAL_REFERENCE',actionAuthorized:false,policyMutable:false,results:rows.map(r=>({id:r.id,text:r.body,role:r.role,createdAt:new Date(r.sourceTime).toISOString(),expiresAt:r.expires,citation:{conversationId:r.conversation,messageId:r.message,...JSON.parse(r.provenance)}}))};
 }
 function remove(p,id){owner(p);sweep();return transaction(()=>{const changes=db.prepare('DELETE FROM conversation_messages WHERE tenant=? AND id=?').run(p.tenantId,string(id,36)).changes;audit(p,'message.deleted',id);return {deleted:changes===1};});}
 function clear(p){owner(p);return transaction(()=>{const count=db.prepare('DELETE FROM conversation_messages WHERE tenant=?').run(p.tenantId).changes;db.prepare('DELETE FROM conversation_reviews WHERE tenant=?').run(p.tenantId);audit(p,'history.deleted','all');return {deleted:count};});}
 sweep();
 return {getPolicy,prepareImport,preparePolicy:(p,next)=>{owner(p);return prepare(p,'policy',policy(next));},approve,recall,remove,clear,sweep,
  reviews:p=>{owner(p);sweep();return db.prepare('SELECT * FROM conversation_reviews WHERE tenant=? AND subject=? ORDER BY expires LIMIT 20').all(p.tenantId,p.subject).map(r=>({id:r.id,hash:r.hash,kind:r.kind,version:r.version,expiresAt:r.expires,review:JSON.parse(r.payload)}));},
  audit:p=>{owner(p);sweep();return db.prepare('SELECT event,reference,at,subject FROM conversation_audit WHERE tenant=? ORDER BY at DESC LIMIT 100').all(p.tenantId);}};
}
