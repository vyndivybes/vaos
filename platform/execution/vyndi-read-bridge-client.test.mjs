import test from 'node:test';
import assert from 'node:assert/strict';
import { createVyndiReadBridgeClient, VYNDI_BRIDGE_KEY_ID } from './vyndi-read-bridge-client.mjs';

test('signed read client binds action, intent and verification metadata', async()=>{
  let signedCanonical='';
  let captured;
  const signer={
    async signVyndiBridgeRequest(input){
      signedCanonical=input.canonical;
      return {keyId:VYNDI_BRIDGE_KEY_ID,signature:'sig-test'};
    },
  };
  const serviceBinding={
    async fetch(url,options){
      captured={url,options};
      const body=JSON.parse(options.body);
      return new Response(JSON.stringify({
        ok:true,
        actionType:body.actionType,
        readOnly:true,
        sourceAuthority:'getAuthoritativeInventory',
        data:{records:[{sku:'SKU-1'}]},
      }),{status:200,headers:{'content-type':'application/json'}});
    },
  };
  const client=createVyndiReadBridgeClient({
    signer,serviceBinding,
    now:()=>1760000000000,
    nonce:()=> 'nonce-read-commission-0001',
  });
  const result=await client.execute({
    id:'job-1',
    intentId:'intent-1',
    actionType:'INVENTORY.OBSERVE_STOCK',
    payload:{missionId:'mission-1',limit:10},
  });
  assert.equal(result.sourceAuthority,'getAuthoritativeInventory');
  assert.equal(result.employeeId,'inventory');
  assert.equal(result.data.records[0].sku,'SKU-1');
  assert.equal(captured.url,'https://vyndi.service/api/vaos/bridge');
  assert.equal(captured.options.headers['x-vaos-key-id'],VYNDI_BRIDGE_KEY_ID);
  assert.equal(captured.options.headers['x-vaos-nonce'],'nonce-read-commission-0001');
  assert.match(signedCanonical,/1760000000000\nnonce-read-commission-0001\n[0-9a-f]{64}/);
});

test('client refuses mutation routes before contacting VYNDI', async()=>{
  let touched=false;
  const client=createVyndiReadBridgeClient({
    signer:{async signVyndiBridgeRequest(){touched=true;}},
    serviceBinding:{async fetch(){touched=true;}},
  });
  await assert.rejects(
    ()=>client.execute({
      id:'job-2',
      intentId:'intent-2',
      actionType:'FINANCE.PREPARE_PAYMENT',
      payload:{},
    }),
    error=>error.code==='VYNDI_READ_ROUTE_NOT_COMMISSIONED',
  );
  assert.equal(touched,false);
});

test('client verifies returned canonical source authority', async()=>{
  const client=createVyndiReadBridgeClient({
    signer:{async signVyndiBridgeRequest(){return {keyId:VYNDI_BRIDGE_KEY_ID,signature:'sig-test'}}},
    serviceBinding:{
      async fetch(){
        return new Response(JSON.stringify({
          ok:true,readOnly:true,actionType:'COMMERCIAL.OBSERVE_PIPELINE',
          sourceAuthority:'wrong-authority',data:{records:[]},
        }),{status:200,headers:{'content-type':'application/json'}});
      },
    },
    now:()=>1760000000000,
    nonce:()=> 'nonce-read-commission-0002',
  });
  await assert.rejects(
    ()=>client.execute({
      id:'job-3',intentId:'intent-3',actionType:'COMMERCIAL.OBSERVE_PIPELINE',payload:{},
    }),
    error=>error.code==='VYNDI_BRIDGE_AUTHORITY_MISMATCH',
  );
});
