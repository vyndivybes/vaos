function required(value, name) {
  if (!value) throw new Error(`SUPABASE_CONFIG_MISSING:${name}`);
  return value;
}

export function createSupabaseControlStore({
  url,
  publishableKey,
  serverSecret,
  fetchImpl = globalThis.fetch,
} = {}) {
  const baseUrl = required(url, 'url').replace(/\/$/, '');
  const apiKey = required(publishableKey, 'publishableKey');
  const secret = required(serverSecret, 'serverSecret');
  if (typeof fetchImpl !== 'function') throw new Error('SUPABASE_CONFIG_MISSING:fetch');

  async function rpc(name, params) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`SUPABASE_RPC_FAILED:${response.status}`);
    }
    return response.json();
  }

  return Object.freeze({
    snapshot() {
      return rpc('vaos_control_snapshot', { p_server_key: secret });
    },
    submitIntent(input) {
      return rpc('vaos_submit_intent', {
        p_server_key: secret,
        p_idempotency_key: input.idempotencyKey,
        p_request_hash: input.requestHash,
        p_agent_id: input.agentId,
        p_action_type: input.actionType,
        p_risk: input.risk,
        p_reason: input.reason,
        p_payload: input.payload || {},
        p_authority: input.authority,
        p_result: input.result,
        p_event_type: input.eventType,
      });
    },
    decideApproval(approvalId, input) {
      return rpc('vaos_decide_approval', {
        p_server_key: secret,
        p_approval_id: approvalId,
        p_decision: input.decision,
        p_decided_by: input.decidedBy,
      });
    },
  });
}
