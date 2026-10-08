function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function requiredText(input,key,code='CALLBACK_INPUT_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail(code,`${code}:${key}`);return v.trim()}
function clone(v){return structuredClone(v)}
function nowDate(fn){const d=fn();if(!(d instanceof Date)||Number.isNaN(d.getTime()))throw fail('CALLBACK_CLOCK_INVALID');return d}
function validateBaseUrl(value){let u;try{u=new URL(value)}catch{throw fail('CALLBACK_BASE_URL_INVALID')}if(u.protocol!=='https:'||u.username||u.password)throw fail('CALLBACK_BASE_URL_INVALID');return u.toString().replace(/\/$/,'')}

export function createInMemoryCallbackStore(){
  const rows=new Map();
  return Object.freeze({
    create(record){
      if(rows.has(record.receiptRef))throw fail('CALLBACK_RECEIPT_DUPLICATE');
      rows.set(record.receiptRef,clone(record));
      return clone(record);
    },
    get(receiptRef){const row=rows.get(receiptRef);return row?clone(row):null},
    save(receiptRef,patch){
      const current=rows.get(receiptRef);if(!current)throw fail('CALLBACK_RECEIPT_NOT_FOUND');
      const next={...current,...clone(patch)};rows.set(receiptRef,next);return clone(next);
    },
    async consumeOnce(receiptRef,{tokenHash,providerId,executionJobId,intentId,actionKey,consumedAt,status,evidence}={}){
      const current=rows.get(receiptRef);if(!current)throw fail('CALLBACK_RECEIPT_NOT_FOUND');
      if(current.consumedAt)throw fail('CALLBACK_RECEIPT_REPLAY');
      if(current.tokenHash!==tokenHash)throw fail('CALLBACK_TOKEN_INVALID');
      if(current.providerId!==providerId||current.executionJobId!==executionJobId||current.intentId!==intentId||current.actionKey!==actionKey){
        throw fail('CALLBACK_CORRELATION_MISMATCH');
      }
      const next={...current,consumedAt,status,evidence:clone(evidence)};
      rows.set(receiptRef,next);
      return clone(next);
    },
    list(){return [...rows.values()].map(clone)},
  });
}

export function createCallbackGateway({
  store,
  tokenFactory,
  hashToken,
  now=()=>new Date(),
  baseUrl,
  validators={},
  recordAudit=async()=>{},
}={}){
  if(!store||typeof store.create!=='function'||typeof store.get!=='function'||typeof store.consumeOnce!=='function')throw fail('CALLBACK_STORE_REQUIRED');
  if(typeof tokenFactory!=='function')throw fail('CALLBACK_TOKEN_FACTORY_REQUIRED');
  if(typeof hashToken!=='function')throw fail('CALLBACK_HASH_REQUIRED');
  if(typeof recordAudit!=='function')throw fail('CALLBACK_AUDIT_INVALID');
  if(!validators||typeof validators!=='object'||Array.isArray(validators))throw fail('CALLBACK_VALIDATORS_INVALID');
  const root=validateBaseUrl(baseUrl);

  async function issue({providerId,executionJobId,intentId,actionKey,ttlSeconds=300}={}){
    providerId=requiredText({providerId},'providerId');
    executionJobId=requiredText({executionJobId},'executionJobId');
    intentId=requiredText({intentId},'intentId');
    actionKey=requiredText({actionKey},'actionKey');
    const ttl=Number(ttlSeconds);
    if(!Number.isInteger(ttl)||ttl<1||ttl>86400)throw fail('CALLBACK_TTL_INVALID');
    const token=tokenFactory();
    if(typeof token!=='string'||token.length<8)throw fail('CALLBACK_TOKEN_INVALID');
    const tokenHash=await hashToken(token);
    if(typeof tokenHash!=='string'||!tokenHash)throw fail('CALLBACK_TOKEN_HASH_INVALID');
    const issuedAt=nowDate(now);
    const expiresAt=new Date(issuedAt.getTime()+ttl*1000).toISOString();
    const receiptRef=`callback:${providerId}:${executionJobId}:${actionKey}`;
    const record={
      receiptRef,providerId,executionJobId,intentId,actionKey,
      tokenHash,issuedAt:issuedAt.toISOString(),expiresAt,consumedAt:null,
      status:null,evidence:null,
    };
    await store.create(record);
    await recordAudit({type:'CALLBACK.RECEIPT.ISSUED',receiptRef,providerId,executionJobId,intentId,actionKey,expiresAt,occurredAt:issuedAt.toISOString()});
    const callbackUrl=`${root}/${encodeURIComponent(receiptRef)}?token=${encodeURIComponent(token)}`;
    return Object.freeze({receiptRef,callbackUrl,expiresAt});
  }

  async function consume(input={}){
    const receiptRef=requiredText(input,'receiptRef');
    const token=requiredText(input,'token');
    const providerId=requiredText(input,'providerId');
    const executionJobId=requiredText(input,'executionJobId');
    const intentId=requiredText(input,'intentId');
    const actionKey=requiredText(input,'actionKey');
    const row=await store.get(receiptRef);
    if(!row)throw fail('CALLBACK_RECEIPT_NOT_FOUND');
    if(row.consumedAt)throw fail('CALLBACK_RECEIPT_REPLAY');

    const clock=nowDate(now);
    if(new Date(row.expiresAt).getTime()<clock.getTime())throw fail('CALLBACK_RECEIPT_EXPIRED');

    const suppliedHash=await hashToken(token);
    if(suppliedHash!==row.tokenHash)throw fail('CALLBACK_TOKEN_INVALID');

    if(row.providerId!==providerId||row.executionJobId!==executionJobId||row.intentId!==intentId||row.actionKey!==actionKey){
      throw fail('CALLBACK_CORRELATION_MISMATCH');
    }

    const validator=typeof validators[providerId]==='function'
      ? validators[providerId]
      : value=>{
          const status=requiredText(value,'status','CALLBACK_PAYLOAD_INVALID');
          if(!['succeeded','failed'].includes(status))throw fail('CALLBACK_PAYLOAD_INVALID');
          const evidence=value.evidence&&typeof value.evidence==='object'&&!Array.isArray(value.evidence)?clone(value.evidence):{};
          return {status,evidence};
        };

    const normalized=await validator(Object.freeze({
      status:input.status,
      evidence:input.evidence,
      providerId,executionJobId,intentId,actionKey,
    }));
    if(!normalized||!['succeeded','failed'].includes(normalized.status)||!normalized.evidence||typeof normalized.evidence!=='object'||Array.isArray(normalized.evidence)){
      throw fail('CALLBACK_PAYLOAD_INVALID');
    }

    const consumedAt=clock.toISOString();
    const saved=await store.consumeOnce(receiptRef,{
      tokenHash:suppliedHash,
      providerId,
      executionJobId,
      intentId,
      actionKey,
      consumedAt,
      status:normalized.status,
      evidence:clone(normalized.evidence),
    });
    await recordAudit({type:'CALLBACK.RECEIPT.CONSUMED',receiptRef,providerId,executionJobId,intentId,actionKey,status:normalized.status,occurredAt:consumedAt});

    return Object.freeze({
      receiptRef:saved.receiptRef,
      providerId:saved.providerId,
      executionJobId:saved.executionJobId,
      intentId:saved.intentId,
      actionKey:saved.actionKey,
      status:saved.status,
      evidence:clone(saved.evidence),
      consumedAt:saved.consumedAt,
    });
  }

  async function waitForReceipt({receiptRef}={}){
    receiptRef=requiredText({receiptRef},'receiptRef');
    const row=await store.get(receiptRef);
    if(!row)throw fail('CALLBACK_RECEIPT_NOT_FOUND');
    if(!row.consumedAt)throw fail('CALLBACK_RECEIPT_PENDING');
    return Object.freeze({
      receiptRef:row.receiptRef,
      providerId:row.providerId,
      executionJobId:row.executionJobId,
      intentId:row.intentId,
      actionKey:row.actionKey,
      status:row.status,
      evidence:clone(row.evidence||{}),
      consumedAt:row.consumedAt,
    });
  }

  return Object.freeze({issue,consume,waitForReceipt});
}
