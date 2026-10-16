import test from 'node:test';
import assert from 'node:assert/strict';
import {browserRequestAllowed,validateWritePaths} from '../browser.mjs';
import {createActions} from '../actions.mjs';
import {skillHash} from '../forge.mjs';

test('browser writes require an exact reviewed path and active explicit step',()=>{
 const origin='https://example.org';
 const allowed=(url,method,active=true)=>browserRequestAllowed({url,method,origin,writePaths:['/save'],active});
 assert.equal(allowed(origin+'/page','GET',false),true);
 assert.equal(allowed('https://other.org/page','GET'),false);
 assert.equal(allowed(origin+'/save','POST'),true);
 for(const [url,method,active] of [[origin+'/other','POST',true],[origin+'/save','DELETE',true],[origin+'/save','POST',false],[origin+'/save?extra=1','POST',true]])assert.equal(allowed(url,method,active),false);
 for(const paths of [['//evil.org'],['/save#x'],['/save?x=1'],['/../save'],['/save','/save'],['/a%2fb']])assert.throws(()=>validateWritePaths(paths),/BROWSER_WRITE_PATHS_INVALID/);
 assert.deepEqual(validateWritePaths(undefined),[]);
});

test('approved skills revalidate exact reviewed definition and revocation at execution',async()=>{
 const definition={name:'clean-list',steps:[{op:'trim'}]};
 let row={id:'skill',definition,hash:skillHash(definition),state:'approved'};
 const run=createActions({store:{skills:()=>[row]}});
 assert.equal((await run('skill.run',{id:'skill',text:' x '})).text,'x');
 row={...row,definition:{...definition,steps:[{op:'uppercase'}]}};
 await assert.rejects(run('skill.run',{id:'skill',text:'x'}),/SKILL_REVIEW_INVALID/);
 row={...row,state:'revoked'};
 await assert.rejects(run('skill.run',{id:'skill',text:'x'}),/SKILL_NOT_APPROVED/);
});
