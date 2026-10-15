import http from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from './store.mjs';
import {createJobs,createScheduler,routineKinds} from './jobs.mjs';
import {createActions,text} from './actions.mjs';
import {pythonOperation} from './python.mjs';
import {proposeSkill,validateSkill,skillHash,testSkill} from './forge.mjs';
import {lockDataDirectory} from './lock.mjs';

const web=fileURLToPath(new URL('../web/',import.meta.url));
const tokenEqual=(left,right)=>{const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);};
const error=(code,status=400)=>Object.assign(Error(code),{status});
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw error('JSON_REQUIRED',415);
 let size=0,chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>15000000)throw error('REQUEST_TOO_LARGE',413);chunks.push(chunk);}
 try{const data=JSON.parse(Buffer.concat(chunks));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{throw error('JSON_INVALID');}
}
export async function createCompanion({dataDir,token=randomBytes(32).toString('base64url'),python,modelDir=resolve(dataDir,'models','tiny.en'),chromePath,run,allowLoopbackForTests=false}={}){
 for(const part of ['','artifacts','uploads','ocr-cache'])await mkdir(resolve(dataDir,part),{recursive:true});
 const releaseLock=lockDataDirectory(dataDir);
 let store;try{store=openStore(resolve(dataDir,'companion.sqlite'));}catch(error){releaseLock();throw error;}
 const actions=run||createActions({dataDir,store,python,modelDir,chromePath,allowLoopbackForTests});
 const jobs=createJobs({store,run:actions}),scheduler=createScheduler({store,jobs});
 let pythonStatus={};try{pythonStatus=await pythonOperation('status',{}, {python,timeout:10000});}catch{}
 const capabilities={documents:{xlsx:true,pdf:true,docx:!!pythonStatus.docx},ocr:true,browser:!!chromePath&&existsSync(chromePath),desktop:process.platform==='win32'&&!!pythonStatus.pyautogui,voice:!!pythonStatus.faster_whisper&&existsSync(resolve(modelDir,'model.bin')),memory:true,routines:true,forge:true};
 const trustedOrigins=new Set(['https://vaos.vayushastr.workers.dev']);
 let localOrigin;
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.headers.host!==new URL(localOrigin).host)throw error('HOST_DENIED',403);
   const origin=req.headers.origin;
   if(origin&&!trustedOrigins.has(origin)&&origin!==localOrigin)throw error('ORIGIN_DENIED',403);
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){
    res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Private-Network':'true','Access-Control-Max-Age':'300'});res.end();return;
   }
   const url=new URL(req.url,localOrigin),path=url.pathname;
   if(path.startsWith('/api/')){
    if(!tokenEqual(req.headers.authorization||'','Bearer '+token))throw error('PAIRING_REQUIRED',401);
    if(req.method==='GET'&&path==='/api/status')return json(res,200,{version:'0.1.0',capabilities,local:true});
    if(req.method==='POST'&&path==='/api/shutdown'){const data=await body(req);if(data.confirm!=='STOP COMPANION')throw error('STOP_CONFIRMATION_REQUIRED');json(res,200,{stopped:true});setImmediate(()=>void close());return;}
    if(req.method==='POST'&&path==='/api/revoke'){jobs.stopAll();token=randomBytes(32).toString('base64url');return json(res,200,{revoked:true});}
    if(req.method==='GET'&&path==='/api/jobs')return json(res,200,jobs.list());
    if(req.method==='POST'&&path==='/api/jobs'){
     const data=await body(req);return json(res,202,jobs.submit(data.kind,data.input));
    }
    const jobMatch=path.match(/^\/api\/jobs\/([a-f0-9-]{36})(?:\/(approve|stop))?$/);
    if(jobMatch){
     if(req.method==='GET'&&!jobMatch[2]){const job=jobs.get(jobMatch[1]);if(!job)throw error('JOB_NOT_FOUND',404);return json(res,200,job);}
     if(req.method==='POST'&&jobMatch[2]==='stop')return json(res,200,{stopped:jobs.stop(jobMatch[1])});
     if(req.method==='POST'&&jobMatch[2]==='approve'){const data=await body(req);if(data.confirm!=='RUN LOCAL ACTION')throw error('ACTION_CONFIRMATION_REQUIRED');return json(res,200,jobs.approve(jobMatch[1],data.hash));}
    }
    if(path==='/api/memories'){
     if(req.method==='GET')return json(res,200,store.memories((url.searchParams.get('q')||'').slice(0,200)));
     if(req.method==='POST'){const data=await body(req);if(data.id&&!/^[a-f0-9-]{36}$/.test(data.id))throw error('MEMORY_ID_INVALID');return json(res,200,store.saveMemory({id:data.id,title:text(data.title,200),body:text(data.body,6000)}));}
    }
    const memoryMatch=path.match(/^\/api\/memories\/([a-f0-9-]{36})$/);
    if(memoryMatch&&req.method==='DELETE')return json(res,200,{deleted:store.deleteMemory(memoryMatch[1])});
    if(path==='/api/routines'){
     if(req.method==='GET')return json(res,200,store.routines());
     if(req.method==='POST'){
      const r=await body(req);if(!routineKinds.has(r.kind))throw error('ROUTINE_OPERATION_DENIED');
      if(JSON.stringify(r.input||{}).length>20000)throw error('ROUTINE_INPUT_TOO_LARGE');
      const eventName=r.eventName?text(r.eventName,64):null;
      const intervalMs=eventName?null:Number(r.intervalMs);
      if(eventName&&!/^[a-z][a-z0-9.-]*$/.test(eventName)||!eventName&&(!Number.isInteger(intervalMs)||intervalMs<60000||intervalMs>31536000000))throw error('ROUTINE_TRIGGER_INVALID');
      return json(res,201,store.saveRoutine({id:randomUUID(),title:text(r.title,200),kind:r.kind,input:r.input||{},intervalMs,eventName,nextAt:intervalMs?Date.now()+intervalMs:null}));
     }
    }
    const routineMatch=path.match(/^\/api\/routines\/([a-f0-9-]{36})$/);
    if(routineMatch&&req.method==='DELETE')return json(res,200,{deleted:store.deleteRoutine(routineMatch[1])});
    if(path==='/api/events'&&req.method==='POST'){const data=await body(req);scheduler.event(text(data.name,64),text(data.id,100));return json(res,202,{accepted:true});}
    if(path==='/api/skills'&&req.method==='GET')return json(res,200,store.skills());
    if(path==='/api/skills/propose'&&req.method==='POST'){
     const data=await body(req),definition=data.definition?validateSkill(data.definition):proposeSkill(data);
     if(!Array.isArray(data.tests)||!data.tests.length||data.tests.length>10)throw error('SKILL_TESTS_REQUIRED');
     const results=await testSkill(definition,data.tests);
     const skill={id:randomUUID(),definition,hash:skillHash(definition),state:results.every(t=>t.passed)?'tested':'failed'};
     store.saveSkill(skill);return json(res,200,{...skill,tests:results});
    }
    const skillMatch=path.match(/^\/api\/skills\/([a-f0-9-]{36})\/approve$/);
    if(skillMatch&&req.method==='POST'){
     const data=await body(req),skill=store.skills().find(s=>s.id===skillMatch[1]);
     if(!skill||skill.state!=='tested'||skill.hash!==data.hash||skillHash(skill.definition)!==data.hash)throw error('SKILL_REVIEW_INVALID');
     skill.state='approved';store.saveSkill(skill);return json(res,200,skill);
    }
    if(path==='/api/artifacts'&&req.method==='GET')return json(res,200,store.artifacts());
    const artifactMatch=path.match(/^\/api\/artifacts\/([a-f0-9-]{36}\.(?:docx|xlsx|pdf|bin))$/);
    if(artifactMatch&&req.method==='DELETE'){
     await unlink(resolve(dataDir,'artifacts',artifactMatch[1])).catch(e=>{if(e.code!=='ENOENT')throw e;});
     return json(res,200,{deleted:store.deleteArtifact(artifactMatch[1])});
    }
    if(artifactMatch&&req.method==='GET'){
     const data=await readFile(resolve(dataDir,'artifacts',artifactMatch[1]));
     res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+artifactMatch[1]+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);return;
    }
    throw error('NOT_FOUND',404);
   }
   const asset=path==='/'?'/skills.html':path;
   const allowed=new Set(['/skills.html','/skills.mjs','/skills.css','/skills-map.mjs','/assets/vayu-shastr-original.webp','/vendor/three.module.min.js','/vendor/three.core.min.js']);
   if(req.method!=='GET'||!allowed.has(asset))throw error('NOT_FOUND',404);
   const data=await readFile(resolve(web,'.'+asset));
   res.writeHead(200,{'Content-Type':{'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp'}[extname(asset)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"});res.end(data);
  }catch(e){json(res,e.status||400,{error:/^[A-Z][A-Z0-9_]{2,90}$/.test(e.message)?e.message:'REQUEST_FAILED'});}
 });
 let timer,closing;
 function close(){
  if(!closing)closing=(async()=>{clearInterval(timer);jobs.stopAll();await jobs.idle();await new Promise(r=>server.close(r));store.close();releaseLock();})();
  return closing;
 }
 return {
  server,store,jobs,scheduler,capabilities,
  async listen(port=47831){try{await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});}catch(error){store.close();releaseLock();throw error;}localOrigin='http://127.0.0.1:'+server.address().port;timer=setInterval(()=>{try{scheduler.tick();}catch{}},1000);return {origin:localOrigin,token};},
  close
 };
}
