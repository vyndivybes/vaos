import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createDocumensoSignAdapter } from './sign-adapter.mjs';

function manifest(overrides={}) {
  return {
    schemaVersion:'vaos.provider.v1',
    providerId:'documenso',
    displayName:'Documenso',
    capabilities:['document.sign'],
    deploymentModes:['self-hosted','managed-saas'],
    qualification:{state:'qualified',qualifiedCapabilities:['document.sign'],evidenceRefs:['q']},
    security:{secretBinding:'required',dataEgress:'controlled',authModes:['api-key'],callbackVerification:'provider-specific'},
    execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'required'},
    ...overrides,
  };
}
function broker(){return createCredentialBroker({async resolveCredential(){return{kind:'api-key',value:'api_documenso_secret',providerId:'documenso',capabilities:['document.sign']}}})}
function job(overrides={}) {
  return {
    id:'job-sign-1',intentId:'intent-sign-1',actionType:'DOCUMENT.SIGN',
    payload:{
      signatureKey:'supplier.nda',
      sourceArtifactRef:'r2:sha256:source123',
      signers:{
        counterparty:{name:'Asha Rao',email:'asha@example.com'},
      },
    },
    ...overrides,
  };
}
function config(overrides={}) {
  return {
    baseUrl:'https://documenso.internal.example/api/v2',
    secretBindingRef:'secret:documenso:api',
    profiles:{
      'supplier.nda':{
        title:'Supplier NDA',
        visibility:'ADMIN',
        recipients:[
          {slot:'counterparty',role:'SIGNER',signingOrder:1},
        ],
        fields:[
          {slot:'counterparty',type:'SIGNATURE',page:1,positionX:'10',positionY:'80',width:'30',height:'5'},
        ],
      },
    },
    dispatchTimeoutMs:15000,
    completionTimeoutMs:300000,
    maxSignedBytes:16777216,
    ...overrides,
  };
}
function sourceReader(){return{async read(){return{bytes:new Uint8Array([1,2,3]),sha256:'source123',contentType:'application/pdf',fileName:'nda.pdf'}}}}
function artifactBroker(){return{async put(input){assert.equal(input.contentType,'application/pdf');return{artifactRef:'r2:sha256:signed456',sha256:'signed456',size:input.bytes.byteLength,contentType:'application/pdf'}}}}
function envelope(overrides={}) {
  return {
    id:'envelope_abc123',
    type:'DOCUMENT',
    status:'COMPLETED',
    externalId:'job-sign-1',
    recipients:[
      {id:1,name:'Asha Rao',email:'asha@example.com',role:'SIGNER',signingStatus:'SIGNED'},
    ],
    envelopeItems:[
      {id:'envelope_item_1'},
    ],
    ...overrides,
  };
}

test('Documenso adapter creates governed envelope, distributes once, verifies completion and seals signed PDF',async()=>{
  const calls=[];
  const a=createDocumensoSignAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),artifactReader:sourceReader(),artifactBroker:artifactBroker(),
    transport:{
      async createEnvelope(req){calls.push({op:'create',req});return{status:200,body:{id:'envelope_abc123',status:'DRAFT'}}},
      async distributeEnvelope(req){calls.push({op:'send',req});return{status:200,body:{success:true,id:'envelope_abc123'}}},
      async waitForEnvelope(req){calls.push({op:'wait',req});return envelope()},
      async downloadSigned(req){calls.push({op:'download',req});return{status:200,bodyBytes:new Uint8Array([9,8,7]),contentType:'application/pdf'}},
    },
    config:config(),
  });
  const r=await a.execute(job());

  assert.equal(r.adapterId,'documenso.sign.v1');
  assert.equal(r.effect.resourceId,'envelope_abc123');
  assert.equal(r.effect.state,'COMPLETED');
  assert.equal(r.effect.signedArtifactRef,'r2:sha256:signed456');
  assert.equal(r.verification.signedSha256,'signed456');
  assert.equal(r.verification.verified,true);

  const create=calls.find(x=>x.op==='create').req;
  assert.equal(create.url,'https://documenso.internal.example/api/v2/envelope/create');
  assert.equal(create.headers.Authorization,'api_documenso_secret');
  assert.equal(create.payload.externalId,'job-sign-1');
  assert.equal(create.payload.recipients[0].email,'asha@example.com');
  assert.equal(create.payload.recipients[0].fields[0].type,'SIGNATURE');

  const send=calls.find(x=>x.op==='send').req;
  assert.equal(send.url,'https://documenso.internal.example/api/v2/envelope/distribute');
  const download=calls.find(x=>x.op==='download').req;
  assert.equal(download.url,'https://documenso.internal.example/api/v2/envelope/item/envelope_item_1/download?version=signed');
  assert.equal(JSON.stringify(r).includes('api_documenso_secret'),false);
});

test('unknown signature profile or missing signer slot fails before side effects',async()=>{
  let touched=false;
  const a=createDocumensoSignAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:createCredentialBroker({async resolveCredential(){touched=true;throw new Error('no')}}),
    artifactReader:{async read(){touched=true}},artifactBroker:{async put(){touched=true}},
    transport:{async createEnvelope(){touched=true},async distributeEnvelope(){touched=true},async waitForEnvelope(){touched=true},async downloadSigned(){touched=true}},
    config:config(),
  });
  await assert.rejects(()=>a.execute(job({payload:{...job().payload,signatureKey:'unknown'}})),/DOCUMENSO_PROFILE_NOT_ALLOWED/);
  await assert.rejects(()=>a.execute(job({payload:{...job().payload,signers:{}}})),/DOCUMENSO_SIGNER_REQUIRED/);
  assert.equal(touched,false);
});

test('provider qualification gate fails before source read or provider side effect',async()=>{
  let touched=false;
  const a=createDocumensoSignAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest({qualification:{state:'evaluation',qualifiedCapabilities:[]}})]}),
    credentialBroker:broker(),artifactReader:{async read(){touched=true}},artifactBroker:{async put(){touched=true}},
    transport:{async createEnvelope(){touched=true},async distributeEnvelope(){touched=true},async waitForEnvelope(){touched=true},async downloadSigned(){touched=true}},
    config:config(),
  });
  await assert.rejects(()=>a.execute(job()),/DOCUMENSO_PROVIDER_NOT_QUALIFIED/);
  assert.equal(touched,false);
});

test('ambiguous envelope creation is unknown and never blindly retried',async()=>{
  const a=createDocumensoSignAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),artifactReader:sourceReader(),artifactBroker:artifactBroker(),
    transport:{
      async createEnvelope(){const e=new Error('timeout');e.requestSent=true;throw e},
      async distributeEnvelope(){throw new Error('unused')},async waitForEnvelope(){throw new Error('unused')},async downloadSigned(){throw new Error('unused')},
    },config:config(),
  });
  await assert.rejects(async()=>{
    try{await a.execute(job())}
    catch(error){
      assert.equal(error.code,'DOCUMENSO_CREATE_OUTCOME_UNKNOWN');
      assert.equal(error.retryable,false);
      assert.equal(error.outcomeUnknown,true);
      throw error;
    }
  },/DOCUMENSO_CREATE_OUTCOME_UNKNOWN/);
});

test('ambiguous distribution preserves envelope id and never sends a duplicate signature request',async()=>{
  let sends=0;
  const a=createDocumensoSignAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),artifactReader:sourceReader(),artifactBroker:artifactBroker(),
    transport:{
      async createEnvelope(){return{status:200,body:{id:'envelope_abc123',status:'DRAFT'}}},
      async distributeEnvelope(){sends+=1;const e=new Error('timeout');e.requestSent=true;throw e},
      async waitForEnvelope(){throw new Error('unused')},async downloadSigned(){throw new Error('unused')},
    },config:config(),
  });
  await assert.rejects(async()=>{
    try{await a.execute(job())}
    catch(error){
      assert.equal(error.code,'DOCUMENSO_DISTRIBUTION_OUTCOME_UNKNOWN');
      assert.equal(error.providerRunId,'envelope_abc123');
      assert.equal(error.retryable,false);
      assert.equal(error.outcomeUnknown,true);
      throw error;
    }
  },/DOCUMENSO_DISTRIBUTION_OUTCOME_UNKNOWN/);
  assert.equal(sends,1);
});

test('pending envelope remains reconcilable; rejected or cancelled envelope is terminal',async()=>{
  for(const [status,code,unknown] of [
    ['PENDING','DOCUMENSO_SIGNATURE_INCOMPLETE',true],
    ['DRAFT','DOCUMENSO_SIGNATURE_INCOMPLETE',true],
    ['REJECTED','DOCUMENSO_SIGNATURE_FAILED',false],
    ['CANCELLED','DOCUMENSO_SIGNATURE_FAILED',false],
  ]){
    const a=createDocumensoSignAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:broker(),artifactReader:sourceReader(),artifactBroker:artifactBroker(),
      transport:{
        async createEnvelope(){return{status:200,body:{id:'envelope_abc123',status:'DRAFT'}}},
        async distributeEnvelope(){return{status:200,body:{success:true,id:'envelope_abc123'}}},
        async waitForEnvelope(){return envelope({status})},
        async downloadSigned(){throw new Error('unused')},
      },config:config(),
    });
    await assert.rejects(async()=>{
      try{await a.execute(job())}
      catch(error){
        assert.equal(error.code,code);
        assert.equal(error.providerRunId,'envelope_abc123');
        assert.equal(error.outcomeUnknown,unknown);
        throw error;
      }
    },new RegExp(code));
  }
});

test('envelope readback must match external id, signer identity and completion state',async()=>{
  for(const bad of [
    envelope({externalId:'other-job'}),
    envelope({recipients:[{id:1,name:'Asha Rao',email:'other@example.com',role:'SIGNER',signingStatus:'SIGNED'}]}),
    envelope({envelopeItems:[]}),
  ]){
    const a=createDocumensoSignAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:broker(),artifactReader:sourceReader(),artifactBroker:artifactBroker(),
      transport:{
        async createEnvelope(){return{status:200,body:{id:'envelope_abc123',status:'DRAFT'}}},
        async distributeEnvelope(){return{status:200,body:{success:true,id:'envelope_abc123'}}},
        async waitForEnvelope(){return bad},
        async downloadSigned(){return{status:200,bodyBytes:new Uint8Array([1]),contentType:'application/pdf'}},
      },config:config(),
    });
    await assert.rejects(()=>a.execute(job()),/DOCUMENSO_VERIFICATION_FAILED/);
  }
});

test('signed download must be PDF and within size limit before artifact persistence',async()=>{
  for(const response of [
    {status:200,bodyBytes:new Uint8Array([1]),contentType:'text/html'},
    {status:200,bodyBytes:new Uint8Array([1,2,3,4]),contentType:'application/pdf'},
  ]){
    let persisted=false;
    const a=createDocumensoSignAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:broker(),artifactReader:sourceReader(),artifactBroker:{async put(){persisted=true}},
      transport:{
        async createEnvelope(){return{status:200,body:{id:'envelope_abc123',status:'DRAFT'}}},
        async distributeEnvelope(){return{status:200,body:{success:true,id:'envelope_abc123'}}},
        async waitForEnvelope(){return envelope()},
        async downloadSigned(){return response},
      },config:config({maxSignedBytes:3}),
    });
    await assert.rejects(()=>a.execute(job()),/DOCUMENSO_SIGNED_(TYPE_INVALID|TOO_LARGE)/);
    assert.equal(persisted,false);
  }
});
