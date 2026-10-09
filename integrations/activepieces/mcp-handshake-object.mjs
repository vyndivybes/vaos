import { remediateProjectOnce } from './project-context-repair.mjs';
import { diagnoseSyntheticHold } from './synthetic-diagnostic.mjs';
import { reconcileExistingQualification } from './reconcile-existing.mjs';
import { auditAppend } from './synthetic-qualification.mjs';
import { qualifyOnce, recoverOnce, qualifyEvidence } from './synthetic-qualification.mjs';
import { createActivepiecesToolClient } from './mcp-tool-client.mjs';
import { credentialKeyReady, sealActivepiecesCredentials, openActivepiecesCredentials } from './credential-vault.mjs';
import { probeActivepiecesMcpReadback, refreshActivepiecesMcpTokens } from './mcp-oauth-handshake.mjs';
import { checkActivepiecesDiscovery } from './oauth-network-probe.mjs';
import { DurableObject } from 'cloudflare:workers';

// One-time authorization-code handshake coordinator. Never stores tokens.
// There is no public fetch handler; only Cloudflare Worker bindings can invoke RPC methods.
export class ActivepiecesMcpHandshake extends DurableObject {
  async syntheticDiagnosis(){
    const existing=await this.ctx.storage.get('ap-qual-diagnostic');
    if(existing)return existing;
    const state=await this.ctx.storage.get('ap-qual-state');
    if(state?.status!=='HOLD'||state.phase!=='BUILD_SUBMITTED')
      return {status:'NOT_APPLICABLE',reason:'AP_NO_AMBIGUOUS_BUILD',productionActivation:false};
    const connection=await this.connectionStatus();
    if(!connection.connected)return {status:'HOLD',reason:'AP_CREDENTIALS_NOT_VERIFIED',productionActivation:false};
    const sealed=await this.ctx.storage.get('oauth-encrypted-credentials');
    if(!sealed)return {status:'HOLD',reason:'AP_CREDENTIALS_NOT_ENROLLED',productionActivation:false};
    try{
      let credentials=await openActivepiecesCredentials(sealed,this.env.ACTIVEPIECES_VAULT_KEY);
      if(credentials.expiresAt<Date.now()+90000){
        credentials=await refreshActivepiecesMcpTokens(credentials);
        await this.ctx.storage.put('oauth-encrypted-credentials',
          await sealActivepiecesCredentials(credentials,this.env.ACTIVEPIECES_VAULT_KEY));
      }
      const client=createActivepiecesToolClient({accessToken:credentials.accessToken});
      const result=await diagnoseSyntheticHold({store:this.ctx.storage,client});
      await auditAppend(this.ctx.storage,'READONLY_DIAGNOSIS',{reason:result.reason});
      return result;
    }catch{return {status:'HOLD',reason:'AP_DIAGNOSIS_UNAVAILABLE',productionActivation:false};}
  }
  async reconcileSyntheticReadOnly() {
    const cached=await this.ctx.storage.get('ap-qual-readonly-reconcile-v4');
    if(cached?.checkedAtMs && Date.now()-cached.checkedAtMs<600000)
      return {...cached,cached:true};
    const state=await this.ctx.storage.get('ap-qual-state');
    if(!state || state.status!=='HOLD')
      return {status:'HOLD',reason:'AP_RECONCILE_NOT_ADMITTED',productionActivation:false};
    const conn=await this.connectionStatus();
    if(!conn.connected)return {status:'HOLD',reason:'AP_CREDENTIALS_NOT_VERIFIED',productionActivation:false};
    const envelope=await this.ctx.storage.get('oauth-encrypted-credentials');
    if(!envelope)return {status:'HOLD',reason:'AP_CREDENTIALS_NOT_ENROLLED',productionActivation:false};
    try {
      let creds=await openActivepiecesCredentials(envelope,this.env.ACTIVEPIECES_VAULT_KEY);
      if(creds.expiresAt<Date.now()+90000){
        creds=await refreshActivepiecesMcpTokens(creds);
        await this.ctx.storage.put('oauth-encrypted-credentials',
          await sealActivepiecesCredentials(creds,this.env.ACTIVEPIECES_VAULT_KEY));
      }
      const client=createActivepiecesToolClient({accessToken:creds.accessToken});
      const report=await reconcileExistingQualification({store:this.ctx.storage,client});
      await auditAppend(this.ctx.storage,'READONLY_RECONCILIATION',{reason:report.reason||report.status});
      return report;
    } catch {
      return {status:'HOLD',reason:'AP_READONLY_RECONCILIATION_UNAVAILABLE',productionActivation:false};
    }
  }
  async syntheticEvidence() {
    return qualifyEvidence(this.ctx.storage);
  }
  async qualifyScheduledOnce(){
    // This is an explicit, one-off commissioning order, not a general agent action.
    if(this.env.ACTIVEPIECES_SYNTHETIC_QUALIFY!=='approved-20261009')
      return {status:'DISABLED',productionActivation:false};
    const prior=await this.ctx.storage.get('ap-qual-state');
    if(prior && prior.status==='PASS')return qualifyEvidence(this.ctx.storage);
    const diagnosis=prior?await this.ctx.storage.get('ap-qual-diagnostic'):null;
    if(prior && !(prior.status==='HOLD'&&prior.phase==='BUILD_SUBMITTED'
      && diagnosis?.reason==='AP_PROJECT_CONTEXT_MISSING')
      && (!prior.runId||!prior.flowId))return qualifyEvidence(this.ctx.storage);
    const connection=await this.connectionStatus();
    if(!connection.connected)return {status:'HOLD',reason:'AP_CREDENTIALS_NOT_VERIFIED',productionActivation:false};
    const envelope=await this.ctx.storage.get('oauth-encrypted-credentials');
    if(!envelope)return {status:'HOLD',reason:'AP_CREDENTIALS_NOT_ENROLLED',productionActivation:false};
    let credentials;
    try{
      credentials=await openActivepiecesCredentials(envelope,this.env.ACTIVEPIECES_VAULT_KEY);
      if(credentials.expiresAt<Date.now()+90000){
        credentials=await refreshActivepiecesMcpTokens(credentials);
        await this.ctx.storage.put('oauth-encrypted-credentials',
          await sealActivepiecesCredentials(credentials,this.env.ACTIVEPIECES_VAULT_KEY));
      }
    }catch {
      return {status:'HOLD',reason:'AP_CREDENTIALS_UNAVAILABLE',productionActivation:false};
    }
    const client=createActivepiecesToolClient({accessToken:credentials.accessToken});
    if(prior && diagnosis?.reason==='AP_PROJECT_CONTEXT_MISSING'
       && prior.phase==='BUILD_SUBMITTED' && prior.status==='HOLD'){
      const result=await remediateProjectOnce({store:this.ctx.storage,client,
        retry:(marker)=>qualifyOnce({store:this.ctx.storage,client,makeMarker:()=>marker,
          resumeRemediation:true})});
      if(result.reason && result.reason!=='AP_REMEDIATION_ALREADY_ATTEMPTED'){
        const current=await this.ctx.storage.get('ap-qual-state');
        await this.ctx.storage.put('ap-qual-state',{...current,status:'HOLD',
          phase:'REMEDIATION_HOLD',reason:result.reason});
        await auditAppend(this.ctx.storage,'REMEDIATION_HOLD',{reason:result.reason});
      }
      return qualifyEvidence(this.ctx.storage);
    }
    if(prior)return recoverOnce({store:this.ctx.storage,client});
    const bytes=crypto.getRandomValues(new Uint8Array(8));
    const marker='VAOSQ_'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    return qualifyOnce({store:this.ctx.storage,client,makeMarker:()=>marker});
  }
  async credentialKeyReady(){return credentialKeyReady(this.env.ACTIVEPIECES_VAULT_KEY)}
  async storeCredentials(record) {
    const encrypted=await sealActivepiecesCredentials(record,this.env.ACTIVEPIECES_VAULT_KEY);
    await this.ctx.storage.put('oauth-encrypted-credentials',encrypted);
    await this.ctx.storage.put('oauth-connection-evidence',{status:'SECURED_PENDING_VERIFY',verifiedAt:null,connected:false,productionActivation:false});
    return {secured:true};
  }
  async connectionStatus() {
    const encrypted=await this.ctx.storage.get('oauth-encrypted-credentials');
    const last=await this.ctx.storage.get('oauth-connection-evidence');
    return {stored:Boolean(encrypted),connected:Boolean(encrypted&&last?.connected),
      status:!encrypted?'NOT_ENROLLED':last?.status||'SECURED_PENDING_VERIFY',
      verifiedAt:last?.verifiedAt||null,productionActivation:false};
  }
  async verifyStoredCredentials() {
    if(!credentialKeyReady(this.env.ACTIVEPIECES_VAULT_KEY))
      throw new Error('ACTIVEPIECES_VAULT_KEY_UNAVAILABLE');
    const stored=await this.ctx.storage.get('oauth-encrypted-credentials');
    if(!stored)throw new Error('ACTIVEPIECES_VAULT_NOT_ENROLLED');
    try {
      let rec=await openActivepiecesCredentials(stored,this.env.ACTIVEPIECES_VAULT_KEY);
      if(rec.expiresAt < Date.now()+60000){
        rec=await refreshActivepiecesMcpTokens(rec);
        await this.ctx.storage.put('oauth-encrypted-credentials',
          await sealActivepiecesCredentials(rec,this.env.ACTIVEPIECES_VAULT_KEY));
      }
      const tools=await probeActivepiecesMcpReadback(rec.accessToken);
      if(!tools.includes('ap_get_run')||!tools.includes('ap_list_runs'))
        throw new Error('ACTIVEPIECES_READBACK_UNAVAILABLE');
      const outcome={status:'MCP_AUTHENTICATED_READBACK_PASS',verifiedAt:new Date().toISOString(),
        connected:true,productionActivation:false};
      await this.ctx.storage.put('oauth-connection-evidence',outcome);
      return outcome;
    }catch {
      // No sensitive diagnostic detail is persisted or emitted.
      const outcome={status:'MCP_READBACK_FAILED',verifiedAt:new Date().toISOString(),
        connected:false,productionActivation:false};
      await this.ctx.storage.put('oauth-connection-evidence',outcome);
      return outcome;
    }
  }
  async disconnectCredentials(){
    await this.ctx.storage.delete('oauth-encrypted-credentials');
    await this.ctx.storage.put('oauth-connection-evidence',{status:'REVOKED_LOCALLY',verifiedAt:new Date().toISOString(),
      connected:false,productionActivation:false});
    return {connected:false,productionActivation:false};
  }

  async probeDiscovery(){
    // Shared Durable Object throttles unauthenticated health reads: at most one
    // actual upstream metadata GET per ten minutes, across all clients.
    const now=Date.now();
    const cached=await this.ctx.storage.get('mcp-public-discovery-health');
    if(cached&&Number.isFinite(cached.checkedAtMs)&&now-cached.checkedAtMs<600000)
      return {ok:cached.ok,code:cached.code,httpStatus:cached.httpStatus,cached:true};
    const observed=await checkActivepiecesDiscovery();
    const safe={ok:observed.ok,code:observed.code,httpStatus:observed.httpStatus,checkedAtMs:now};
    await this.ctx.storage.put('mcp-public-discovery-health',safe);
    return {ok:safe.ok,code:safe.code,httpStatus:safe.httpStatus,cached:false};
  }
  async put(record) {
    if(!record||typeof record.nonce!=='string'||typeof record.verifier!=='string'
      ||!Number.isFinite(record.expiresAt))throw new Error('ACTIVEPIECES_OAUTH_STATE_INVALID');
    await this.ctx.storage.put('oauth-pending',record);
    return {accepted:true};
  }
  async take(nonce) {
    // Serialized DO RPC ensures one callback consumes the nonce.
    const pending=await this.ctx.storage.get('oauth-pending');
    if(!pending||pending.nonce!==nonce)return null;
    await this.ctx.storage.delete('oauth-pending');
    return pending;
  }
  async record(outcome) {
    const clean={status:outcome?.status||'FAILED',verifiedAt:outcome?.verifiedAt||null,
      readonlyTools:Array.isArray(outcome?.readonlyTools)?outcome.readonlyTools:[],
      reasonCode:outcome?.reasonCode||null,productionActivation:false};
    await this.ctx.storage.put('oauth-last-evidence',clean);
    return clean;
  }
  async status() {
    return await this.ctx.storage.get('oauth-last-evidence')||{
      status:'NOT_CONNECTED',verifiedAt:null,readonlyTools:[],productionActivation:false,
    };
  }
}