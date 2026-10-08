import http from 'node:http';

const port=Number(process.env.VAOS_WAVE1_STAGING_PORT||18766);
const cookie='vaos_wave1_session=qualified';

function body(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    req.on('data',chunk=>chunks.push(chunk));
    req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error',reject);
  });
}

const server=http.createServer(async(req,res)=>{
  if(req.url==='/health'){
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({ok:true}));
    return;
  }
  if(req.method==='GET'&&req.url==='/login'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end('<!doctype html><html><body><form method="post" action="/login"><input name="username" id="username"><input name="password" id="password" type="password"><button id="submit" type="submit">Sign in</button></form></body></html>');
    return;
  }
  if(req.method==='POST'&&req.url==='/login'){
    const raw=await body(req);
    const params=new URLSearchParams(raw);
    if(params.get('username')==='wave1'&&params.get('password')==='qualified'){
      res.writeHead(302,{location:'/private','set-cookie':cookie+'; HttpOnly; SameSite=Strict; Path=/'});
      res.end();
      return;
    }
    res.writeHead(401,{'content-type':'text/plain'});res.end('unauthorized');return;
  }
  if(req.method==='GET'&&req.url==='/private'){
    if(!(req.headers.cookie||'').split(';').map(v=>v.trim()).includes(cookie)){
      res.writeHead(401,{'content-type':'text/plain'});res.end('unauthorized');return;
    }
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end('<!doctype html><html><head><title>VAOS Qualified Session</title></head><body><main id="status">authenticated</main></body></html>');
    return;
  }
  res.writeHead(404,{'content-type':'text/plain'});res.end('not found');
});

server.listen(port,'127.0.0.1',()=>console.log(`wave1-staging-http-fixture listening on ${port}`));
