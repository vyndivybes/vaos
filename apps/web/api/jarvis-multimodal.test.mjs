import test from 'node:test';
import assert from 'node:assert/strict';
import {createJarvisMultimodalHandler} from './jarvis-multimodal.mjs';
import {validateDocumentUpload} from '../lib/multimodal-contract.mjs';

function harness({email='shyamsundhar1982@gmail.com',control='founder-preview-only-v1'}={}){
 const invocations=[],env={VAOS_MULTIMODAL_CONTROL:control,AI:{async toMarkdown(x){invocations.push({type:'document',x});return{format:'markdown',data:'# Engineering review\nThis is a test document about the importance of checking quantities, references, approvals and source identifiers. The data should not be considered certified.'}},async run(model,input){invocations.push({type:'image',model,input});return{choices:[{message:{content:'A visual engineering drawing, but some fine labels are hard to read.'}}]}}}};
 const handler=createJarvisMultimodalHandler({getSession:()=>email?{email}:null});
 const req=(op,payload,origin='https://vaos.example')=>({method:op?'POST':'GET',url:'https://vaos.example/api/jarvis-multimodal',headers:{origin,'content-type':'application/json'},body:op?{operation:op,...payload}:undefined,env});
 async function run(op,payload,origin){
  let code=200,response=null;const res={setHeader(){return res},status(n){code=n;return res},json(x){response=x;return res}};
  await handler(req(op,payload,origin),res);return{status:code,body:response};
 }
 return{env,run,invocations};
}
const pdf='JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmoKJSVFT0Y=';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
test('same contract allows bounded documents and rejects file-type spoofing',()=>{
 assert.equal(validateDocumentUpload({name:'notes.pdf',base64:pdf}),null);
 assert.ok(validateDocumentUpload({name:'notes.exe',base64:pdf}));
});
test('founder-only preview gate protects conversion and vision',async()=>{
 const disabled=harness({control:undefined});assert.equal((await disabled.run('CONVERT_DOCUMENT',{name:'notes.pdf',base64:pdf,confirm:true})).status,409);assert.equal(disabled.invocations.length,0);
 const stranger=harness({email:'kaaviyam1519@gmail.com'});assert.equal((await stranger.run('CONVERT_DOCUMENT',{name:'notes.pdf',base64:pdf,confirm:true})).status,403);
 const noSession=harness({email:''});assert.equal((await noSession.run('ANALYZE_IMAGE',{image,question:'Read this picture',confirm:true})).status,401);
 const origin=harness();assert.equal((await origin.run('ANALYZE_IMAGE',{image,question:'Explain this image',confirm:true},'https://evil.test')).status,403);
});
test('founder can explicitly convert one document without storing document data',async()=>{
 const h=harness();const d=await h.run('CONVERT_DOCUMENT',{name:'notes.pdf',base64:pdf,confirm:true});
 assert.equal(d.status,200);assert.equal(d.body.data.status,'ready');assert.equal(d.body.data.stored,false);
 assert.match(d.body.data.text,/engineering|Engineering/);
 assert.equal(h.invocations.length,1);
 assert.equal(JSON.stringify(d.body).includes(pdf),false);
});
test('vision uses image in user content parts and validates consent',async()=>{
 const h=harness();const a=await h.run('ANALYZE_IMAGE',{image,question:'Explain this drawing',confirm:true});
 assert.equal(a.status,200);assert.equal(a.body.data.status,'unverified-ai');assert.equal(a.body.data.stored,false);
 const call=h.invocations[0];assert.equal(call.type,'image');assert.match(call.model,/gemma-4/);
 assert.ok(call.input.messages[1].content.some(c=>c.type==='image_url'));
 assert.equal((await h.run('ANALYZE_IMAGE',{image,question:'Explain this drawing',confirm:false})).status,400);
});
test('status exposes truthful readiness but never offers unchecked data write power',async()=>{
 const disabled=harness({control:undefined});const r=await disabled.run();
 assert.equal(r.status,200);assert.equal(r.body.data.enabled,false);assert.equal(r.body.data.writeAuthorized,false);
});
