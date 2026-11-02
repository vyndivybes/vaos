import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const excluded=new Set(['node_modules','vendor','.data','.runtime','.git','.wrangler-dry-run']);
const files=[];
async function collect(dir){
 for(const item of await readdir(resolve(root,dir),{withFileTypes:true})){
  const path=dir+'/'+item.name;
  if(item.isDirectory()&&!excluded.has(item.name))await collect(path);
  else if(item.isFile()&&/\.m?js$/.test(item.name))files.push(path);
 }
}
for(const dir of ['apps','agents','platform','packages','integrations','intelligence','scripts','governance','workflows','compute','mcp','digital-thread'])await collect(dir);
let failed=false;
// Avoid the Windows shell's command length limit. Each invocation checks one file.
async function worker(){while(files.length){const file=files.pop();const code=await new Promise((done,reject)=>{const child=spawn(process.execPath,['--check',file],{cwd:root,stdio:'inherit',windowsHide:true,shell:false});child.once('error',reject);child.once('close',done);});if(code!==0)failed=true;}}
const count=files.length;await Promise.all(Array.from({length:4},worker));
console.log('Syntax checked '+count+' source and test files.');if(failed)process.exitCode=1;
