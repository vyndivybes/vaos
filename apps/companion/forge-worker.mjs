import {parentPort,workerData} from 'node:worker_threads';
import {runSkill} from './forge.mjs';
try{
 parentPort.postMessage({results:workerData.tests.map(test=>({passed:runSkill(workerData.definition,test.input)===test.expected}))});
}catch{parentPort.postMessage({error:'SKILL_TEST_FAILED'});}
