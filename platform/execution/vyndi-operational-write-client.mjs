import {
  VYNDI_BRIDGE_AUDIENCE,
  VYNDI_BRIDGE_KEY_ID,
  VYNDI_BRIDGE_METHOD,
  VYNDI_BRIDGE_PATH,
  VYNDI_BRIDGE_PROTOCOL_VERSION,
  VYNDI_BRIDGE_SERVICE_IDENTITY,
  canonicalBridgeSignatureInput,
} from './vyndi-read-bridge-client.mjs';

export const VYNDI_OPERATIONAL_WRITE_PROFILE = 'PEOPLE_DRAFT_MASTER_V1';
export const VYNDI_OPERATIONAL_WRITE_PURPOSE = 'write-execute';
export const VYNDI_OPERATIONAL_WRITE_ACTION = 'PEOPLE.CHANGE_EMPLOYEE_MASTER';

function terminalError(code,message=code){
  const error=new Error(message);
  error.code=code;
  error.retryable=false;
  return error;
}

function requiredText(value,code){
  if(typeof value!=='string'||!value.trim()) throw terminalError(code);
  return value.trim();
}

function bytesToHex(buffer){
  return Array.from(new Uint8Array(buffer),(value)=>value.toString(16).padStart(2,'0')).join('');
}

async function sha256Hex(value){
  return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
}

function requiredRevision(value){
  const revision=Number(value);
  if(!Number.isInteger(revision)||revision<1) throw terminalError('VYNDI_OPERATIONAL_WRITE_EXPECTED_REVISION_REQUIRED');
  return revision;
}

function optionalMonth(value,code){
  if(value===null||value===undefined||value==='') return null;
  const month=Number(value);
  if(!Number.isInteger(month)||month<1||month>36) throw terminalError(code);
  return month;
}

export function createVyndiOperationalWriteClient({
  signer,
  serviceBinding,
  now=()=>Date.now(),
  nonce=()=>crypto.randomUUID().replace(/-/g,''),
}={}){
  if(!signer||typeof signer.signVyndiBridgeRequest!=='function'){
    throw terminalError('VYNDI_BRIDGE_SIGNER_REQUIRED');
  }
  if(!serviceBinding||typeof serviceBinding.fetch!=='function'){
    throw terminalError('VYNDI_SERVICE_BINDING_REQUIRED');
  }

  return Object.freeze({
    async execute(job){
      if(job?.actionType!==VYNDI_OPERATIONAL_WRITE_ACTION){
        throw terminalError('VYNDI_OPERATIONAL_WRITE_SCOPE_DENIED');
      }
      if(
        job?.payload?.operationalWrite!==true
        || job?.payload?.operationalWriteProfile!==VYNDI_OPERATIONAL_WRITE_PROFILE
      ){
        throw terminalError('VYNDI_OPERATIONAL_WRITE_PROFILE_REQUIRED');
      }

      const control=job?.payload?._vaosControl;
      if(!control||typeof control!=='object'||Array.isArray(control)){
        throw terminalError('VYNDI_OPERATIONAL_WRITE_CONTROL_REQUIRED');
      }

      const idempotencyKey=requiredText(control.idempotencyKey,'VYNDI_OPERATIONAL_WRITE_IDEMPOTENCY_REQUIRED');
      const approvalId=requiredText(control.approvalId,'VYNDI_OPERATIONAL_WRITE_APPROVAL_REQUIRED');
      const requestedBy=requiredText(control.requestedBy,'VYNDI_OPERATIONAL_WRITE_REQUESTER_REQUIRED');
      const approvedBy=requiredText(control.approvedBy,'VYNDI_OPERATIONAL_WRITE_APPROVER_REQUIRED');
      if(requestedBy.toLowerCase()===approvedBy.toLowerCase()){
        throw terminalError('VYNDI_OPERATIONAL_WRITE_SOD_REQUIRED');
      }

      const executionJobId=requiredText(job?.id,'VYNDI_OPERATIONAL_WRITE_JOB_REQUIRED');
      const intentId=requiredText(job?.intentId,'VYNDI_OPERATIONAL_WRITE_INTENT_REQUIRED');
      const expectedRevision=requiredRevision(job?.payload?.expectedRevision);
      const id=requiredText(job?.payload?.id,'VYNDI_OPERATIONAL_WRITE_TARGET_REQUIRED');
      const displayName=requiredText(job?.payload?.displayName,'VYNDI_OPERATIONAL_WRITE_DISPLAY_NAME_REQUIRED');
      const functionName=requiredText(job?.payload?.functionName,'VYNDI_OPERATIONAL_WRITE_FUNCTION_REQUIRED');
      const roleTitle=requiredText(job?.payload?.roleTitle,'VYNDI_OPERATIONAL_WRITE_ROLE_REQUIRED');
      const engagementType=requiredText(job?.payload?.engagementType,'VYNDI_OPERATIONAL_WRITE_ENGAGEMENT_REQUIRED');
      if(!['employee','contractor','consultant','planned_role'].includes(engagementType)){
        throw terminalError('VYNDI_OPERATIONAL_WRITE_ENGAGEMENT_INVALID');
      }
      const startMonth=optionalMonth(job?.payload?.startMonth,'VYNDI_OPERATIONAL_WRITE_START_MONTH_INVALID');
      const endMonth=optionalMonth(job?.payload?.endMonth,'VYNDI_OPERATIONAL_WRITE_END_MONTH_INVALID');
      if(startMonth!==null&&endMonth!==null&&endMonth<startMonth){
        throw terminalError('VYNDI_OPERATIONAL_WRITE_MONTH_RANGE_INVALID');
      }
      const notes=job?.payload?.notes==null?'':String(job.payload.notes);
      if(notes.length>2000) throw terminalError('VYNDI_OPERATIONAL_WRITE_NOTES_INVALID');

      const [requestedByHash,approvedByHash]=await Promise.all([
        sha256Hex(requestedBy.trim().toLowerCase()),
        sha256Hex(approvedBy.trim().toLowerCase()),
      ]);

      const sourceReference=`VAOS|${intentId}|${executionJobId}`;
      const input=Object.freeze({
        id,
        expectedRevision,
        displayName,
        functionName,
        roleTitle,
        engagementType,
        startMonth,
        endMonth,
        sourceReference,
        notes,
      });

      const body=JSON.stringify({
        protocolVersion:VYNDI_BRIDGE_PROTOCOL_VERSION,
        serviceIdentity:VYNDI_BRIDGE_SERVICE_IDENTITY,
        audience:VYNDI_BRIDGE_AUDIENCE,
        method:VYNDI_BRIDGE_METHOD,
        path:VYNDI_BRIDGE_PATH,
        purpose:VYNDI_OPERATIONAL_WRITE_PURPOSE,
        actionType:VYNDI_OPERATIONAL_WRITE_ACTION,
        employeeId:'people',
        intentId,
        executionJobId,
        approvalId,
        missionId:`operational-write:${intentId}`,
        operationalWriteProfile:VYNDI_OPERATIONAL_WRITE_PROFILE,
        idempotencyKey,
        requestedByHash,
        approvedByHash,
        input,
      });

      const timestamp=String(now());
      const requestNonce=nonce();
      const bodySha256=await sha256Hex(body);
      const canonical=canonicalBridgeSignatureInput({timestamp,nonce:requestNonce,bodySha256});

      const signed=await signer.signVyndiBridgeRequest({
        keyId:VYNDI_BRIDGE_KEY_ID,
        canonical,
      });
      if(!signed||signed.keyId!==VYNDI_BRIDGE_KEY_ID||typeof signed.signature!=='string'){
        throw terminalError('VYNDI_BRIDGE_SIGNATURE_UNAVAILABLE');
      }

      const response=await serviceBinding.fetch(`https://vyndi.service${VYNDI_BRIDGE_PATH}`,{
        method:VYNDI_BRIDGE_METHOD,
        headers:{
          'content-type':'application/json',
          'cache-control':'no-store',
          'x-vaos-key-id':signed.keyId,
          'x-vaos-timestamp':timestamp,
          'x-vaos-nonce':requestNonce,
          'x-vaos-body-sha256':bodySha256,
          'x-vaos-signature':signed.signature,
        },
        body,
      });

      const payload=await response.json().catch(()=>null);
      if(!response.ok){
        const error=terminalError(
          'VYNDI_OPERATIONAL_WRITE_FAILED',
          `VYNDI_OPERATIONAL_WRITE_FAILED:${response.status}:${payload?.error||'unknown'}`,
        );
        error.retryable=response.status>=500;
        throw error;
      }

      const verified=Boolean(
        payload
        && payload.ok===true
        && payload.operationalWrite===true
        && payload.readOnly===false
        && payload.actionType===VYNDI_OPERATIONAL_WRITE_ACTION
        && payload.sourceAuthority==='savePeopleRecordDraft'
        && payload.operationalWriteProfile===VYNDI_OPERATIONAL_WRITE_PROFILE
        && payload.resourceId===id
        && payload.outcome==='EXECUTED'
        && payload.finalState==='draft'
        && Number(payload.initialRevision)===expectedRevision
        && Number(payload.finalRevision)>expectedRevision
      );
      if(!verified) throw terminalError('VYNDI_OPERATIONAL_WRITE_VERIFICATION_MISMATCH');

      return Object.freeze({
        actionType:VYNDI_OPERATIONAL_WRITE_ACTION,
        employeeId:'people',
        sourceAuthority:'savePeopleRecordDraft',
        operationalWriteProfile:VYNDI_OPERATIONAL_WRITE_PROFILE,
        approvalId,
        resourceId:id,
        outcome:payload.outcome,
        finalState:payload.finalState,
        initialRevision:Number(payload.initialRevision),
        finalRevision:Number(payload.finalRevision),
        replay:payload.replay===true,
        nonce:requestNonce,
        bodySha256,
      });
    },
  });
}
