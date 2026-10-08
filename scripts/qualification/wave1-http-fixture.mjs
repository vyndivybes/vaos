import http from 'node:http';

const port=Number(process.env.VAOS_WAVE1_HTTP_PORT||18765);
const server=http.createServer((req,res)=>{
  if(req.url==='/ok'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end('<!doctype html><html><head><title>VAOS Wave 1</title></head><body><main id="status">ready</main></body></html>');
    return;
  }
  if(req.url==='/fail'){
    res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});
    res.end('intentional qualification failure fixture');
    return;
  }
  res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});
  res.end('not found');
});
server.listen(port,'127.0.0.1',()=>console.log(`wave1-http-fixture listening on ${port}`));
