// Loopback-only training harness. Not imported by the production Worker.
import {createServer} from 'node:http';
import login from '../../apps/web/api/login.mjs';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../../apps/web/lib/auth.mjs';
import {ROLE_EXERCISES,teachingRecord,TRAINING_OBSERVED_AT} from './workforce-training-fixtures.mjs';
import {evaluateTrainingRecord,evidenceHash} from './workforce-role-training.mjs';
const founder='shyamsundhar1982@gmail.com';
export async function startLocalTrainingServer(db){
 await db.exec(`CREATE TABLE IF NOT EXISTS local_role_training(
 event_id text primary key,employee_id text not null,input_hash text not null,
 output jsonb not null CHECK(output @> '{"synthetic":true,"qualificationGranted":false,"productionWriteAuthorized":false,"environment":"LOCAL_ISOLATED_SYNTHETIC"}'::jsonb));`);
 let origin;
 const server=createServer(async(req,res)=>{
  const reply=(status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body));};
  try{
   if(req.headers.host!==new URL(origin).host)return reply(403,{error:'LOCAL_HOST_REQUIRED'});
   const path=new URL(req.url,origin).pathname;
   if(req.method==='POST'&&req.headers.origin!==origin)return reply(403,{error:'LOCAL_ORIGIN_REQUIRED'});
   if(req.method==='POST'&&req.headers['content-type']!=='application/json')return reply(415,{error:'JSON_REQUIRED'});
   const readBody=async()=>{let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw Error('BODY_TOO_LARGE');}return JSON.parse(text);};
   if(path==='/training/login'&&req.method==='POST'){
    const body=await readBody();const state={status:200,headers:{},body:null};
    const response={setHeader(k,v){state.headers[k]=v;return response},status(s){state.status=s;return response},json(b){state.body=b;return response}};
    login({method:'POST',body},response);return reply(state.status,state.body,state.headers);
   }
   const session=verifySessionToken(parseCookies(req.headers.cookie||'')[SESSION_COOKIE]);
   if(!session)return reply(401,{error:'LOGIN_REQUIRED'});
   if(session.email!==founder)return reply(403,{error:'FOUNDER_REQUIRED'});
   if(path==='/training/results'&&req.method==='GET'){
    const rows=(await db.query('SELECT event_id,employee_id,output FROM local_role_training ORDER BY event_id')).rows;
    return reply(200,{environment:'LOCAL_ISOLATED_SYNTHETIC',rows,qualificationGranted:false});
   }
   if(path==='/training/run'&&req.method==='POST'){
    if(req.headers['x-vaos-training']!=='synthetic-only')return reply(403,{error:'TRAINING_HEADER_REQUIRED'});
    const body=await readBody();
    if(!body||Object.keys(body).sort().join(',')!=='employeeId,eventId,variant'
      ||!Object.hasOwn(ROLE_EXERCISES,body.employeeId)||!['good','bad'].includes(body.variant)
      ||typeof body.eventId!=='string'||!/^TRAINING-[A-Z0-9-]+$/.test(body.eventId))return reply(422,{error:'TRAINING_INPUT_INVALID'});
    const record=teachingRecord(body.employeeId,body.variant);
    const inputHash=evidenceHash(body);
    const result=await db.transaction(async tx=>{
     const prior=(await tx.query('SELECT input_hash,output FROM local_role_training WHERE event_id=$1',[body.eventId])).rows[0];
     if(prior){if(prior.input_hash!==inputHash)throw Error('EVENT_CONFLICT');return {replayed:true,output:prior.output};}
     const output=evaluateTrainingRecord(body.employeeId,record,{environment:'LOCAL_ISOLATED_SYNTHETIC',observedAt:TRAINING_OBSERVED_AT});
     await tx.query('INSERT INTO local_role_training VALUES($1,$2,$3,$4::jsonb)',[body.eventId,body.employeeId,inputHash,JSON.stringify(output)]);
     return {replayed:false,output};
    });return reply(200,result);
   }
   return reply(404,{error:'ROUTE_UNAVAILABLE'});
  }catch(error){return reply(error.message==='EVENT_CONFLICT'?409:400,{error:error.message==='EVENT_CONFLICT'?'EVENT_CONFLICT':'INVALID_TRAINING_REQUEST'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;
 return {origin,close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();})};
}
