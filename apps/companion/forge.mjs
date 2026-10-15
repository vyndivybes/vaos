import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
// Deliberately bounded skill language. No eval, imports, network, filesystem or shell.
const operations=new Set(['trim','uppercase','lowercase','unique-lines','sort-lines','prefix']);
export function validateSkill(definition){
 if(!definition||typeof definition.name!=='string'||!/^[a-z][a-z0-9-]{2,47}$/.test(definition.name))throw Error('SKILL_NAME_INVALID');
 if(!Array.isArray(definition.steps)||!definition.steps.length||definition.steps.length>12)throw Error('SKILL_STEPS_INVALID');
 return {name:definition.name,steps:definition.steps.map(step=>{
  if(!operations.has(step.op))throw Error('SKILL_OPERATION_DENIED');
  if(step.op==='prefix'&&(typeof step.value!=='string'||step.value.length>200))throw Error('SKILL_PREFIX_INVALID');
  return step.op==='prefix'?{op:step.op,value:step.value}:{op:step.op};
 })};
}
export function skillHash(definition){return createHash('sha256').update(JSON.stringify(validateSkill(definition))).digest('hex');}
export function runSkill(definition,input){
 if(typeof input!=='string'||input.length>12000)throw Error('SKILL_INPUT_INVALID');
 let value=input;
 for(const step of validateSkill(definition).steps){
  switch(step.op){
   case 'trim':value=value.trim();break;
   case 'uppercase':value=value.toUpperCase();break;
   case 'lowercase':value=value.toLowerCase();break;
   case 'unique-lines':value=[...new Set(value.split('\n'))].join('\n');break;
   case 'sort-lines':value=value.split('\n').sort().join('\n');break;
   case 'prefix':value=step.value+value;break;
  }
  if(value.length>16000)throw Error('SKILL_OUTPUT_TOO_LARGE');
 }
 return value;
}
export function proposeSkill({name,purpose}){
 if(typeof purpose!=='string'||purpose.length>1000)throw Error('SKILL_PURPOSE_INVALID');
 const steps=[];
 if(/trim|clean/i.test(purpose))steps.push({op:'trim'});
 if(/unique|deduplicat|duplicate/i.test(purpose))steps.push({op:'unique-lines'});
 if(/sort|alphabet/i.test(purpose))steps.push({op:'sort-lines'});
 if(/uppercase|upper case/i.test(purpose))steps.push({op:'uppercase'});
 else if(/lowercase|lower case/i.test(purpose))steps.push({op:'lowercase'});
 if(!steps.length)throw Error('SKILL_PURPOSE_UNSUPPORTED');
 return validateSkill({name,steps});
}
export function testSkill(definition,tests){
 validateSkill(definition);
 if(!Array.isArray(tests)||!tests.length||tests.length>10||tests.some(t=>typeof t.input!=='string'||t.input.length>12000||typeof t.expected!=='string'||t.expected.length>16000))throw Error('SKILL_TESTS_INVALID');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./forge-worker.mjs',import.meta.url),{workerData:{definition,tests},resourceLimits:{maxOldGenerationSizeMb:16,maxYoungGenerationSizeMb:4}});
  const timer=setTimeout(()=>{void worker.terminate();reject(Error('SKILL_TEST_TIMEOUT'));},3000);
  worker.once('message',message=>{clearTimeout(timer);void worker.terminate();message.error?reject(Error(message.error)):resolve(message.results);});
  worker.once('error',()=>{clearTimeout(timer);reject(Error('SKILL_TEST_FAILED'));});
 });
}
