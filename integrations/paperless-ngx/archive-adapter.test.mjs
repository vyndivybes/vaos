import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createPaperlessArchiveAdapter } from './archive-adapter.mjs';

function manifest(overrides={}) {
  return {
    schemaVersion:'vaos.provider.v1',
    providerId:'paperless-ngx',
    displayName:'Paperless-ngx',
    capabilities:['document.archive'],
    deploymentModes:['self-hosted'],
    qualification:{
      state:'qualified',
      qualifiedCapabilities:['document.archive'],
      evidenceRefs:['qualification:paperless:test'],
    },
    security:{
      secretBinding:'required',
      dataEgress:'controlled',
      authModes:['token'],
      callbackVerification:'none',
    },
    execution:{
      idempotency:'not-supported',
      retrySemantics:'conditional',
      verificationStrategy:'provider-readback',
      healthProbe:'required',
    },
    ...overrides,
  };
}
function broker(){
  return createCredentialBroker({
    async resolveCredential(){
      return {
        kind:'token',
        value:'paperless-token',
        providerId:'paperless-ngx',
        capabilities:['document.archive'],
      };
    },
  });
}
function job(overrides={}) {
  return {
    id:'job-archive-101',
    intentId:'intent-archive-101',
    actionType:'DOCUMENT.ARCHIVE',
    payload:{
      intakeKey:'supplier.document',
      sourceArtifactRef:'r2:sha256:abc123',
      sourceSha256:'abc123',
      fileName:'supplier-quote.pdf',
      title:'Supplier Quote',
      metadata:{tags:['supplier','quote']},
    },
    ...overrides,
  };
}
function config(overrides={}) {
  return {
    baseUrl:'https://paperless.internal.example',
    secretBindingRef:'secret:paperless:api',
    apiVersion:10,
    intakeProfiles:{
      'supplier.document':{
        documentType:7,
        storagePath:2,
      },
    },
    dispatchTimeoutMs:15000,
    completionTimeoutMs:120000,
    ...overrides,
  };
}
function completedTask(overrides={}) {
  return {
    taskId:'task-uuid-1',
    status:'SUCCESS',
    documentId:321,
    ...overrides,
  };
}
function documentRow(overrides={}) {
  return {
    id:321,
    title:'Supplier Quote',
    original_file_name:'supplier-quote.pdf',
    checksum:'abc123',
    archive_checksum:'def456',
    ...overrides,
  };
}

test('Paperless adapter archives governed artifact, follows task UUID, and verifies document readback', async()=>{
  const calls=[];
  const adapter=createPaperlessArchiveAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),
    transport:{
      async postDocument(req){calls.push({op:'post',req});return{status:200,headers:{},body:'task-uuid-1'}},
      async waitForTask(req){calls.push({op:'task',req});return completedTask()},
      async readDocument(req){calls.push({op:'doc',req});return documentRow()},
    },
    config:config(),
  });

  const result=await adapter.execute(job());

  assert.equal(result.adapterId,'paperless.archive.v1');
  assert.equal(result.providerId,'paperless-ngx');
  assert.equal(result.capability,'document.archive');
  assert.equal(result.effect.resourceId,'321');
  assert.equal(result.effect.state,'ARCHIVED');
  assert.equal(result.verification.taskId,'task-uuid-1');
  assert.equal(result.verification.sourceArtifactRef,'r2:sha256:abc123');
  assert.equal(result.verification.sourceSha256,'abc123');
  assert.equal(result.verification.archiveSha256,'def456');

  const post=calls.find(x=>x.op==='post').req;
  assert.equal(post.url,'https://paperless.internal.example/api/documents/post_document/');
  assert.equal(post.headers.Authorization,'Token paperless-token');
  assert.equal(post.headers.Accept,'application/json; version=10');
  assert.equal(post.multipart.documentArtifactRef,'r2:sha256:abc123');
  assert.equal(post.multipart.document_type,7);
  assert.equal(post.multipart.storage_path,2);

  const task=calls.find(x=>x.op==='task').req;
  assert.equal(task.url,'https://paperless.internal.example/api/tasks/?task_id=task-uuid-1');
  const doc=calls.find(x=>x.op==='doc').req;
  assert.equal(doc.url,'https://paperless.internal.example/api/documents/321/');
  assert.equal(JSON.stringify(result).includes('paperless-token'),false);
});

test('unknown intake key is rejected before credentials or provider calls', async()=>{
  let touched=false;
  const b=createCredentialBroker({async resolveCredential(){touched=true;throw new Error('no')}})
  const adapter=createPaperlessArchiveAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:b,
    transport:{async postDocument(){touched=true},async waitForTask(){touched=true},async readDocument(){touched=true}},
    config:config(),
  });
  await assert.rejects(
    ()=>adapter.execute(job({payload:{...job().payload,intakeKey:'unapproved'}})),
    /PAPERLESS_INTAKE_NOT_ALLOWED/,
  );
  assert.equal(touched,false);
});

test('provider qualification gate fails closed before archive side effect', async()=>{
  let touched=false;
  const adapter=createPaperlessArchiveAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest({qualification:{state:'evaluation',qualifiedCapabilities:[]}})]}),
    credentialBroker:broker(),
    transport:{async postDocument(){touched=true},async waitForTask(){touched=true},async readDocument(){touched=true}},
    config:config(),
  });
  await assert.rejects(()=>adapter.execute(job()),/PAPERLESS_PROVIDER_NOT_QUALIFIED/);
  assert.equal(touched,false);
});

test('pre-send archive failure is retryable; post-send ambiguity is unknown and never blindly retried', async()=>{
  for(const [sent,code,retryable,unknown] of [
    [false,'PAPERLESS_DISPATCH_UNAVAILABLE',true,false],
    [true,'PAPERLESS_OUTCOME_UNKNOWN',false,true],
  ]){
    const adapter=createPaperlessArchiveAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:broker(),
      transport:{
        async postDocument(){const e=new Error('network');e.requestSent=sent;throw e},
        async waitForTask(){throw new Error('unused')},
        async readDocument(){throw new Error('unused')},
      },
      config:config(),
    });
    await assert.rejects(async()=>{
      try{await adapter.execute(job())}
      catch(error){
        assert.equal(error.code,code);
        assert.equal(error.retryable,retryable);
        assert.equal(error.outcomeUnknown,unknown);
        throw error;
      }
    },new RegExp(code));
  }
});

test('task readback loss after task UUID never redispatches and preserves task identity', async()=>{
  let posts=0;
  const adapter=createPaperlessArchiveAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),
    transport:{
      async postDocument(){posts+=1;return{status:200,headers:{},body:'task-uuid-1'}},
      async waitForTask(){throw new Error('task endpoint unavailable')},
      async readDocument(){throw new Error('unused')},
    },
    config:config(),
  });
  await assert.rejects(async()=>{
    try{await adapter.execute(job())}
    catch(error){
      assert.equal(error.code,'PAPERLESS_TASK_STATUS_PENDING');
      assert.equal(error.providerRunId,'task-uuid-1');
      assert.equal(error.outcomeUnknown,true);
      assert.equal(error.retryable,false);
      throw error;
    }
  },/PAPERLESS_TASK_STATUS_PENDING/);
  assert.equal(posts,1);
});

test('active task remains reconcilable and failed task is terminal', async()=>{
  for(const [taskStatus,code,retryable] of [
    ['STARTED','PAPERLESS_TASK_INCOMPLETE',false],
    ['PENDING','PAPERLESS_TASK_INCOMPLETE',false],
    ['FAILURE','PAPERLESS_ARCHIVE_FAILED',false],
  ]){
    const adapter=createPaperlessArchiveAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:broker(),
      transport:{
        async postDocument(){return{status:200,headers:{},body:'task-uuid-1'}},
        async waitForTask(){return completedTask({status:taskStatus,documentId:null})},
        async readDocument(){throw new Error('unused')},
      },
      config:config(),
    });
    await assert.rejects(async()=>{
      try{await adapter.execute(job())}
      catch(error){
        assert.equal(error.code,code);
        assert.equal(error.providerRunId,'task-uuid-1');
        assert.equal(error.retryable,retryable);
        throw error;
      }
    },new RegExp(code));
  }
});

test('document readback must match created document and source checksum', async()=>{
  for(const row of [
    documentRow({id:999}),
    documentRow({checksum:'different'}),
  ]){
    const adapter=createPaperlessArchiveAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:broker(),
      transport:{
        async postDocument(){return{status:200,headers:{},body:'task-uuid-1'}},
        async waitForTask(){return completedTask()},
        async readDocument(){return row},
      },
      config:config(),
    });
    await assert.rejects(()=>adapter.execute(job()),/PAPERLESS_VERIFICATION_FAILED/);
  }
});

test('archive result never claims Paperless is canonical enterprise truth', async()=>{
  const adapter=createPaperlessArchiveAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),
    transport:{
      async postDocument(){return{status:200,headers:{},body:'task-uuid-1'}},
      async waitForTask(){return completedTask()},
      async readDocument(){return documentRow()},
    },
    config:config(),
  });
  const result=await adapter.execute(job());
  assert.equal(result.effect.canonicalStateUpdated,false);
});
