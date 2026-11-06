/** Explicit local historical export adapters, never self-connecting to a
 * browser account, local Obsidian vault, SPARK graph or ChatGPT internals.
 */
const MAX_TEXT=64000,MAX_RECORDS=45000;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const REL=/^[A-Za-z][A-Za-z0-9_-]{0,49}$/;
const IMPORT_SOURCES=new Set(['obsidian','graphiti','graphify','github','vyndios','vaos']);
function fail(name){throw Error('HISTORY_IMPORT_'+name);}
function clean(value,max=220){
 return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
}
function dateFrom(value){
 if(value==null)return null;
 const n=Number(value);
 if(Number.isFinite(n)&&n>1e9&&n<1e13){
  const ms=n<1e11?n*1000:n;
  return new Date(ms).toISOString();
 }
 if(typeof value==='string'&&Number.isFinite(Date.parse(value)))return new Date(value).toISOString();
 return null;
}
async function stableId(text){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return 'h'+Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('').slice(0,48);
}
function limitedBody(v){return typeof v==='string'?v.replace(/\u0000/g,'').slice(0,MAX_TEXT):'';}
function textParts(message){
 const content=message?.content;
 if(typeof content?.text==='string')return {text:content.text,complete:content.text.length<=MAX_TEXT};
 if(!Array.isArray(content?.parts))return {text:'',complete:false};
 const text=content.parts.filter(x=>typeof x==='string').join('\n');
 return {text,complete:content.parts.length>0&&content.parts.every(x=>typeof x==='string')&&text.length<=MAX_TEXT};
}
export function parseConversationExport(input){
 const conversations=Array.isArray(input)?input:input?.conversations;
 if(!Array.isArray(conversations)||conversations.length>MAX_RECORDS)fail('EXPORT_INVALID');
 const records=[];
 for(const conv of conversations){
  if(!IDENTIFIER.test(conv?.id||''))fail('CONVERSATION_ID_INVALID');
  const mapping=conv?.mapping;
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))continue;
  const found=new Map();
  for(const [key,node] of Object.entries(mapping)){
   if(!node?.message)continue;
   if(!IDENTIFIER.test(key))fail('MESSAGE_ID_INVALID');
   const message=node.message,parts=textParts(message);
   const id=conv.id+':'+key;
   const title=clean(conv.title||'Conversation',160)+' · '+clean(message.author?.role||'message',30);
   const row={id,title,body:limitedBody(parts.text),kind:'chat_message',
    sourceRef:'chatgpt:'+conv.id+'/'+key,
    modifiedAt:dateFrom(message.create_time||conv.update_time||conv.create_time),
    complete:parts.complete,links:[]};
   found.set(key,row);records.push(row);
   if(records.length>MAX_RECORDS)fail('EXPORT_TOO_LARGE');
  }
  for(const [key,node] of Object.entries(mapping)){
   const parent=node?.parent;
   if(typeof parent==='string'&&found.has(parent)&&found.has(key))
    found.get(parent).links.push({targetId:found.get(key).id,relation:'REPLIES_TO'});
  }
 }
 return records;
}
export async function parseMarkdownNote(relativePath,body){
 if(typeof relativePath!=='string'||relativePath.length>420||relativePath.includes('\u0000')||
   relativePath.split('/').some(x=>x==='..'||x==='.'))fail('PATH_INVALID');
 if(typeof body!=='string')fail('CONTENT_INVALID');
 const id=await stableId('obsidian:'+relativePath);
 const name=relativePath.split('/').at(-1).replace(/\.md$/i,'');
 return {id,title:clean(name)||'Untitled note',body:limitedBody(body),
  sourceRef:'obsidian:'+relativePath,kind:'markdown_note',modifiedAt:null,
  complete:body.length<=MAX_TEXT,links:[]};
}
export async function parseKnowledgeExport(source,input){
 if(!IMPORT_SOURCES.has(source))fail('SOURCE_DENIED');
 const rows=Array.isArray(input)?input:Array.isArray(input?.entities)?input.entities:
  Array.isArray(input?.pages)?input.pages:Array.isArray(input?.notes)?input.notes:
  Array.isArray(input?.nodes)?input.nodes:Array.isArray(input?.records)?input.records:null;
 if(!Array.isArray(rows)||rows.length>MAX_RECORDS)fail('EXPORT_INVALID');
 const records=[],ids=new Map();
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  if(!row||typeof row!=='object')continue;
  const raw=String(row.id||row.path||row.filePath||row.name||row.title||i);
  if(raw.length>600)fail('ID_INVALID');
  const id=await stableId(source+':'+raw);
  if(ids.has(raw))fail('DUPLICATE_ID');
  ids.set(raw,id);
  const original=row.body??row.content??row.text??row.description??row.definition??row.summary;
  const hasBody=typeof original==='string';
  records.push({id,title:clean(row.title||row.name||row.path||raw),
   body:limitedBody(original),sourceRef:clean(source+':'+raw,420),
   kind:clean(row.kind||row.type||'record',60).replace(/[^a-zA-Z0-9_-]/g,'_')||'record',
   modifiedAt:dateFrom(row.modifiedAt||row.updatedAt||row.valid_at),
   complete:hasBody&&original.length<=MAX_TEXT,links:[]});
 }
 const rels=Array.isArray(input?.facts)?input.facts:
  Array.isArray(input?.edges)?input.edges:Array.isArray(input?.links)?input.links:[];
 const recordById=new Map(records.map(r=>[r.id,r]));
 for(const edge of rels.slice(0,50000)){
  const from=ids.get(String(edge.from??edge.source??'')),to=ids.get(String(edge.to??edge.target??''));
  const relation=String(edge.relation||edge.type||'REFERENCES');
  if(from&&to&&REL.test(relation)){
   const origin=recordById.get(from);
   if(origin.links.length<80)origin.links.push({targetId:to,relation});
  }
 }
 return records;
}
