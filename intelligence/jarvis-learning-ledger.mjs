import {projectJarvisA05ShadowReceipt} from './jarvis-a05-shadow-holdout.mjs';
/** Founder-consented, append-only-by-API aggregate evaluation receipts.
 * The system retains no raw prompt, answer, reviewer identity, or sample ID.
 * A record is NOT proof of independent review, self-learning or model improvement.
 */
const PREFIX='jarvis/founder/learning-review/v1/';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT=/^\d{4}-\d{2}-\d{2}\/([0-9a-f-]{36})$/i;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const validSummary=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 x.schemaVersion==='JARVIS_PAIRED_EVALUATION_V1'&&
 x.status==='DESCRIPTIVE_METRICS_ONLY'&&
 x.autoPromotionAuthorized===false&&Array.isArray(x.holds);
function ensureBucket(bucket,method){if(typeof bucket?.[method]!=='function')throw Error('LEARNING_ARCHIVE_UNAVAILABLE');}
function keyOf(receipt){
 if(typeof receipt!=='string'||!RECEIPT.test(receipt)||!UUID.test(receipt.slice(11))||
  Number.isNaN(Date.parse(receipt.slice(0,10)+'T00:00:00.000Z')))
  throw Error('LEARNING_RECEIPT_INVALID');
 return PREFIX+receipt+'.json';
}
export async function saveLearningReview({bucket,batch,summary,now=new Date(),uuid=()=>crypto.randomUUID()}){
 ensureBucket(bucket,'put');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!validSummary(summary))throw Error('LEARNING_ARCHIVE_INVALID');
 const id=uuid();if(!UUID.test(id))throw Error('LEARNING_ARCHIVE_INVALID');
 const receipt=now.toISOString().slice(0,10)+'/'+id;
 const sha256=await hash(JSON.stringify(batch));
 // Aggregate whitelist: never copy arbitrary submitted fields into storage.
 const allowed=['schemaVersion','mode','status','baseline','candidate','regressions',
  'improvements','safetyRegressions','calibrationMethod','latencyMethod','holds',
  'reviewerIndependenceVerified','productionAccuracyCertified','confidenceCalibrationCertified',
  'operationalOutcomesVerified','productionForecastCertified','autoPromotionAuthorized',
  'actionAuthorized','modelInvocations','sourceRecordsExported'];
 const safe=Object.fromEntries(allowed.filter(k=>Object.hasOwn(summary,k)).map(k=>[k,summary[k]]));
 if(Object.hasOwn(summary,'a05ShadowReview'))
  safe.a05ShadowReview=projectJarvisA05ShadowReceipt(summary.a05ShadowReview);
 const record={schemaVersion:'VAOS_JARVIS_AGGREGATE_LEARNING_RECEIPT_V1',
  recordedAt:now.toISOString(),receipt,inputSha256:sha256,summary:safe,
  declaredReviewerProvenanceUnverified:true,modelChanged:false,learningCertified:false,
  businessActionAuthorized:false};
 await bucket.put(keyOf(receipt),JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
 return {stored:true,receipt,sha256,modelChanged:false,learningCertified:false,
  policyChangesAuthorized:false};
}
export async function readLearningReview({bucket,receipt}){
 const key=keyOf(receipt);ensureBucket(bucket,'get');
 const obj=await bucket.get(key);
 if(!obj)throw Error('LEARNING_RECEIPT_NOT_FOUND');
 let record;
 try{record=JSON.parse(await obj.text())}catch{throw Error('LEARNING_RECEIPT_UNVERIFIED')}
 if(record?.schemaVersion!=='VAOS_JARVIS_AGGREGATE_LEARNING_RECEIPT_V1'||
  record.receipt!==receipt||!/^([a-f0-9]{64})$/.test(record.inputSha256||'')||
  !validSummary(record.summary)||record.learningCertified!==false||record.modelChanged!==false||
  record.businessActionAuthorized!==false)throw Error('LEARNING_RECEIPT_UNVERIFIED');
 // Only project an allowlisted aggregate from archive. Never relay arbitrary
 // R2 JSON or input sample IDs, and reject forged A05 certification flags.
 let cleanA05;
 try{if(Object.hasOwn(record.summary,'a05ShadowReview'))
  cleanA05=projectJarvisA05ShadowReceipt(record.summary.a05ShadowReview);}
 catch{throw Error('LEARNING_RECEIPT_UNVERIFIED');}
 const cleanSummary=Object.fromEntries([
  'schemaVersion','mode','status','baseline','candidate','regressions',
  'improvements','safetyRegressions','calibrationMethod','latencyMethod',
  'holds','reviewerIndependenceVerified','productionAccuracyCertified',
  'confidenceCalibrationCertified','operationalOutcomesVerified',
  'productionForecastCertified','autoPromotionAuthorized','actionAuthorized',
  'modelInvocations','sourceRecordsExported'
 ].filter(k=>Object.hasOwn(record.summary,k)).map(k=>[k,record.summary[k]]));
 if(cleanA05)cleanSummary.a05ShadowReview=cleanA05;
 return {schemaVersion:record.schemaVersion,receipt:record.receipt,
  recordedAt:record.recordedAt,sha256:record.inputSha256,summary:cleanSummary,
  stored:true,learningCertified:false,modelChanged:false,policyChangesAuthorized:false};
}
