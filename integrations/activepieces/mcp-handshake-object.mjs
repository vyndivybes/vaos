import { checkActivepiecesDiscovery } from './oauth-network-probe.mjs';
import { DurableObject } from 'cloudflare:workers';

// One-time authorization-code handshake coordinator. Never stores tokens.
// There is no public fetch handler; only Cloudflare Worker bindings can invoke RPC methods.
export class ActivepiecesMcpHandshake extends DurableObject {
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