import { DurableObject } from 'cloudflare:workers';

// One-time authorization-code handshake coordinator. Never stores tokens.
// There is no public fetch handler; only Cloudflare Worker bindings can invoke RPC methods.
export class ActivepiecesMcpHandshake extends DurableObject {
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