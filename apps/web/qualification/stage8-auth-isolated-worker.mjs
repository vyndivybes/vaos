// Local-only Stage 8 runtime qualification fixture. Not included in production Worker entry.
import login from '../api/login.mjs';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
export default {
 async fetch(request){
  const url=new URL(request.url);
  if(request.method==='POST' && url.pathname==='/qualification/login'){
   let body;try{body=await request.json();}catch{return new Response('bad-json',{status:400});}
   const output={status:200,headers:{},payload:null};
   const response={setHeader(k,v){output.headers[k]=v;return response},
     status(s){output.status=s;return response},json(x){output.payload=x;return response}};
   login({method:'POST',headers:{},body},response);
   return new Response(JSON.stringify(output.payload),{
    status:output.status,headers:{'Content-Type':'application/json',...(output.headers['Set-Cookie']?{'Set-Cookie':output.headers['Set-Cookie']}:{})}
   });
  }
  if(request.method==='GET'&&url.pathname==='/qualification/session'){
   const t=parseCookies(request.headers.get('cookie')||'')[SESSION_COOKIE];
   const verified=verifySessionToken(t);
   return Response.json({valid:!!verified,role:verified?.email=== 'kaaviyam1519@gmail.com'?'checker':verified?'maker':null},
    {status:verified?200:401,headers:{'Cache-Control':'no-store'}});
  }
  return new Response('not found',{status:404});
 }
};
