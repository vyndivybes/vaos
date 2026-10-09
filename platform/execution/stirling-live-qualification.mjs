import {createStirlingTransformAdapter,createStirlingCloudTransport} from '../../integrations/stirling-pdf/transform-adapter.mjs';
import {createInfisicalSecretResolver} from '../../integrations/infisical/secret-resolver.mjs';
import {createInfisicalApiTransport} from '../../integrations/infisical/api-transport.mjs';
import {createGovernedHttpTransport} from './governed-http-transport.mjs';
import {createCredentialBroker} from './credential-broker.mjs';
import {createArtifactBroker,createR2ArtifactStore,createR2ArtifactReader} from './artifact-broker.mjs';

const DATA=Object.freeze({providerId:'stirling-pdf',capability:'document.transform',productionActivation:false});
const AUDIT='qualification/stirling-cloud/v1/evidence.json';
const LOCK='qualification/stirling-cloud/v1/one-shot-lock';
const PDF_BASE64="JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNTYgPj4Kc3RyZWFtCkJUCi9GMSAyNCBUZgo3MiA3MjAgVGQKKFZBT1MgV2F2ZSAzIFN5bnRoZXRpYyBEb2N1bWVudCkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNjYgMDAwMDAgbiAKMDAwMDAwMDM0MyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0OQolJUVPRgo=";
const fail=code=>Object.assign(new Error(code),{code,retryable:false});
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
const hash=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
const pdf=()=>Uint8Array.from(atob(PDF_BASE64),c=>c.charCodeAt(0));
const endpoint=env=>env?.INFISICAL_BASE_URL||'https://us.infisical.com';
function config(env){
  const needed=['STIRLING_INFISICAL_CLIENT_ID','STIRLING_INFISICAL_CLIENT_SECRET','STIRLING_INFISICAL_PROJECT_ID'];
  if(needed.some(k=>typeof env?.[k]!=='string'||!env[k].trim())||
    env.STIRLING_API_BASE!=='https://api.stirling.com'||
    !env?.VAOS_ARTIFACTS||typeof env.VAOS_ARTIFACTS.get!=='function'||
    typeof env.VAOS_ARTIFACTS.put!=='function'||typeof env.VAOS_ARTIFACTS.head!=='function'){
    throw fail('STIRLING_LIVE_CONFIG_HOLD');
  }
  const api=endpoint(env);
  if(!['https://us.infisical.com','https://app.infisical.com'].includes(api))
    throw fail('STIRLING_LIVE_INFISICAL_HOST_DENIED');
  const envName=env.STIRLING_INFISICAL_ENVIRONMENT||env.INFISICAL_ENVIRONMENT||'dev';
  if(!/^[a-z0-9-]{2,32}$/.test(envName))throw fail('STIRLING_LIVE_INFISICAL_ENV_INVALID');
  const secretPath=env.STIRLING_INFISICAL_SECRET_PATH||'/';
  if(!/^\/(?:[A-Za-z0-9_./-]{0,100})$/.test(secretPath)||secretPath.includes('..'))
    throw fail('STIRLING_LIVE_SECRET_PATH_INVALID');
  return {api,envName,secretPath};
}
async function readEvidence(bucket){
  let obj;
  try{obj=await bucket.get(AUDIT)}catch{return {...DATA,status:'HOLD',reason:'STIRLING_AUDIT_READ_UNAVAILABLE',auditVerified:false}}
  if(!obj)return {...DATA,status:'HOLD',reason:'STIRLING_NOT_EXECUTED',auditVerified:false};
  let bytes,row;
  try{
    bytes=new Uint8Array(await obj.arrayBuffer());
    if(bytes.byteLength>4000||bytes.byteLength<8||obj.httpMetadata?.contentType!=='application/json')
      throw Error();
    if((await hash(bytes))!==obj.customMetadata?.sha256)throw Error();
    row=JSON.parse(new TextDecoder().decode(bytes));
    if(!['PASS','HOLD'].includes(row.status))throw Error();
  }catch{return {...DATA,status:'HOLD',reason:'STIRLING_AUDIT_INTEGRITY_FAILED',auditVerified:false}}
  if(row.status!=='PASS')return {...DATA,status:'HOLD',reason:row.reason||'STIRLING_QUALIFICATION_FAILED',auditVerified:true};
  try{
    const reader=createR2ArtifactReader({bucket});
    const [source,output]=await Promise.all([reader.read(row.sourceRef),reader.read(row.outputRef)]);
    if(source.sha256!==row.sourceSha256||output.sha256!==row.outputSha256||source.sha256===output.sha256||
       output.bytes.byteLength<20)throw Error();
    return {...DATA,status:'PASS',reason:'STIRLING_LIVE_ARTIFACT_READBACK_VERIFIED',
      sourceSha256:source.sha256,outputSha256:output.sha256,auditVerified:true,
      outputPdfVerified:true,githubRunId:row.githubRunId||null,checkedAt:row.checkedAt};
  }catch{return {...DATA,status:'HOLD',reason:'STIRLING_INDEPENDENT_READBACK_FAILED',auditVerified:false}}
}
async function writeEvidence(bucket,row){
  const bytes=new TextEncoder().encode(JSON.stringify(row));
  await bucket.put(AUDIT,bytes,{httpMetadata:{contentType:'application/json'},
    customMetadata:{sha256:await hash(bytes),providerId:'stirling-pdf',qualification:'one-shot'}});
}
export async function getStirlingLiveQualificationEvidence({env}={}){
  if(!env?.VAOS_ARTIFACTS||typeof env.VAOS_ARTIFACTS.get!=='function')
    return {...DATA,status:'HOLD',reason:'STIRLING_ARTIFACT_BINDING_MISSING',auditVerified:false};
  return readEvidence(env.VAOS_ARTIFACTS);
}
export async function runStirlingLiveQualification({env,fetchImpl=globalThis.fetch,githubRunId=''}={}){
  const cfg=config(env),bucket=env.VAOS_ARTIFACTS;
  const existing=await readEvidence(bucket);
  if(existing.auditVerified===true)return {...existing,cached:true};
  if(await bucket.head(LOCK))return {...DATA,status:'HOLD',reason:'STIRLING_PREVIOUS_ATTEMPT_UNRESOLVED',
    auditVerified:false,productionActivation:false};
  // R2 conditional create prevents concurrent requests from executing the same paid provider operation.
  const lock=await bucket.put(LOCK,new TextEncoder().encode(new Date().toISOString()),{
    onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'text/plain'}});
  if(!lock)return {...DATA,status:'HOLD',reason:'STIRLING_QUALIFICATION_ALREADY_STARTED',auditVerified:false};
  let record={status:'HOLD',reason:'STIRLING_LIVE_UNAVAILABLE',checkedAt:new Date().toISOString(),
    githubRunId:String(githubRunId).slice(0,50)};
  try{
    const http=createGovernedHttpTransport({allowedOrigins:[cfg.api],fetchImpl,
      maxResponseBytes:131072,maxRequestBytes:32768});
    const infisical=createInfisicalApiTransport({baseUrl:cfg.api,httpTransport:http});
    const resolveCredential=createInfisicalSecretResolver({
      bootstrapIdentity:async()=>({clientId:env.STIRLING_INFISICAL_CLIENT_ID,
        clientSecret:env.STIRLING_INFISICAL_CLIENT_SECRET}),
      transport:infisical,
      config:{bindings:{'secret:stirling:api':{
        projectId:env.STIRLING_INFISICAL_PROJECT_ID,environment:cfg.envName,
        secretPath:cfg.secretPath,secretKey:'STIRLING_API_KEY',providerId:'stirling-pdf',
        capabilities:['document.transform'],kind:'api-key',
      }},leaseTtlSeconds:300},
    });
    const store=createR2ArtifactStore({bucket});
    const broker=createArtifactBroker({store,maxBytes:2_097_152,allowedContentTypes:['application/pdf']});
    const reader=createR2ArtifactReader({bucket,maxBytes:2_097_152});
    const bytes=pdf();
    const source=await broker.put({executionJobId:'stirling-live-v1',intentId:'stirling-qualification-v1',
      kind:'qualification.synthetic.source',contentType:'application/pdf',bytes});
    const adapter=createStirlingTransformAdapter({
      // This isolated qualification-only registry never updates normal production routing.
      capabilityRegistry:{resolve:(cap,{allowedProviderIds}={})=>cap==='document.transform'&&
        allowedProviderIds?.includes('stirling-pdf')?{providerId:'stirling-pdf'}:null},
      credentialBroker:createCredentialBroker({resolveCredential}),
      artifactReader:reader,artifactBroker:broker,
      transport:createStirlingCloudTransport({fetchImpl,maxInputBytes:2_097_152,maxOutputBytes:2_097_152}),
      config:{baseUrl:env.STIRLING_API_BASE,secretBindingRef:'secret:stirling:api',
        operations:{'pdf.rotate-90':{endpointPath:'/api/v1/general/rotate-pdf',
          operation:'rotate-pdf',inputContentTypes:['application/pdf'],
          outputContentType:'application/pdf',allowedOptions:['angle'],deterministic:true,
          maxOutputBytes:2_097_152}},timeoutMs:20000},
    });
    const result=await adapter.execute({id:'stirling-live-v1',intentId:'stirling-qualification-v1',
      actionType:'DOCUMENT.TRANSFORM',payload:{operationKey:'pdf.rotate-90',
        sourceArtifactRef:source.artifactRef,options:{angle:90}}});
    // This is deliberately an independent R2 GET and SHA256 recomputation.
    const output=await reader.read(result.verification.outputArtifactRef);
    if(source.sha256!==result.verification.sourceSha256||
       output.sha256!==result.verification.outputSha256||
       output.sha256===source.sha256||output.bytes.byteLength<20)
      throw fail('STIRLING_LIVE_OUTPUT_READBACK_MISMATCH');
    record={...record,status:'PASS',reason:'STIRLING_LIVE_ARTIFACT_READBACK_VERIFIED',
      sourceRef:source.artifactRef,sourceSha256:source.sha256,
      outputRef:result.verification.outputArtifactRef,outputSha256:output.sha256};
  }catch(error){
    const code=typeof error?.code==='string'&&/^(STIRLING|INFISICAL|CREDENTIAL|GOV_HTTP|ARTIFACT)_[A-Z0-9_]+$/.test(error.code)
      ?error.code:'STIRLING_LIVE_UNAVAILABLE';
    record.reason=code;
  }
  await writeEvidence(bucket,record);
  return readEvidence(bucket);
}
