import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
test('no shipped VAOS browser module can select Windows/browser TTS',async()=>{
 const root=fileURLToPath(new URL('./',import.meta.url)),violations=[];let checked=0;
 async function inspect(dir){for(const item of await readdir(resolve(root,dir),{withFileTypes:true})){
  const path=dir+'/'+item.name;
  if(item.isDirectory()&&!['vendor','api','qualification'].includes(item.name))await inspect(path);
  if(item.isFile()&&/\.m?js$/.test(item.name)&&!item.name.endsWith('.test.mjs')){checked++;const src=await readFile(resolve(root,path),'utf8');if(/\b(?:window|globalThis)\s*(?:\?\.)?\.?(?:speechSynthesis|SpeechSynthesisUtterance)\b|\bnew\s+SpeechSynthesisUtterance\b/.test(src))violations.push(path);}
 }}
 await inspect('.');assert.ok(checked>50);assert.deepEqual(violations,[]);
});
