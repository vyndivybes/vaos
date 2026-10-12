// Audit-only evaluator. Processes binding names/types, NEVER credential values.
const typeOf=(items,name)=>items.find(x=>x&&x.name===name)?.type;
export function assessSlackSigningCommissioning(bindings, {signedEventVerified=false}={}){
 const items=Array.isArray(bindings)?bindings:[];
 const holds=[];
 const secure=typeOf(items,'VAOS_SLACK_SIGNING_SECRET_SECURE');
 const legacy=typeOf(items,'SLACK_SIGNING_SECRET');
 const bot=typeOf(items,'SLACK_BOT_TOKEN');
 if(!secure)holds.push('ENCRYPTED_SIGNING_BINDING_ABSENT');
 else if(secure!=='secret_text')holds.push('SIGNING_BINDING_NOT_ENCRYPTED');
 if(legacy)holds.push('PLAINTEXT_LEGACY_BINDING_PRESENT');
 if(!bot)holds.push('BOT_TOKEN_MISSING');
 else if(bot!=='secret_text')holds.push('BOT_TOKEN_NOT_ENCRYPTED');
 // Caller must independently verify a real Slack HMAC request and response.
 // This evaluator cannot establish live delivery by inspecting bindings alone.
 if(signedEventVerified!==true)holds.push('SIGNED_EVENT_DELIVERY_UNVERIFIED');
 return Object.freeze({state:holds.length?'HOLD':'PASS',
  commissioned:holds.length===0,
  holds:Object.freeze(holds),
  dataSource:'BINDING_METADATA_PLUS_DELIVERY_ATTESTATION',
  actionAuthorized:false,
  secretValuesRead:false});
}
if(process.argv.includes('--live-metadata-only')){
 const token=process.env.CLOUDFLARE_API_TOKEN||'',
  account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
 if(!/^[a-f0-9]{32}$/i.test(account)||!token)throw Error('SLACK_GATE_RUNTIME_CREDENTIALS_REQUIRED');
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+
  '/workers/scripts/vaos/settings',{headers:{Authorization:'Bearer '+token}});
 if(response.status!==200)throw Error('SLACK_GATE_CLOUDFLARE_METADATA_FETCH_FAILED_'+response.status);
 const result=await response.json();
 if(result?.success!==true||!Array.isArray(result?.result?.bindings))
  throw Error('SLACK_GATE_CLOUDFLARE_METADATA_INVALID');
 const metadata=result.result.bindings.map(({name,type})=>({name,type}));
 const verdict=assessSlackSigningCommissioning(metadata);
 // No values, tokens, or hashes appear in output. Fail closed until live delivery separately attested.
 console.log('VAOS_SLACK_SIGNING_COMMISSIONING',JSON.stringify(verdict));
 if(!verdict.commissioned)process.exitCode=2;
}
