// AES-256-GCM envelope for VAOS Activepieces OAuth tokens.
// The non-extractable AES CryptoKey is provisioned in Cloudflare as a secret_key
// binding. Only ciphertext, nonce, and non-sensitive metadata enter DO storage.
const AAD = new TextEncoder().encode('vaos:activepieces:mcp-credentials:v1');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const error = (code) => Object.assign(new Error(code), { code });
const encode64 = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode64 = (text) => {
  if (typeof text !== 'string' || !/^[a-zA-Z0-9_-]{1,90000}$/.test(text)) throw error('ACTIVEPIECES_VAULT_CIPHERTEXT_INVALID');
  const bytes = atob(text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - text.length % 4) % 4));
  return Uint8Array.from(bytes, ch => ch.charCodeAt(0));
};
export function credentialKeyReady(key) {
  return Boolean(key && key.type === 'secret' && key.extractable === false &&
    key.algorithm?.name === 'AES-GCM' && key.algorithm?.length === 256 &&
    key.usages?.includes('encrypt') && key.usages?.includes('decrypt'));
}
function valid(record) {
  return record && typeof record.accessToken === 'string' && record.accessToken.length > 8 &&
    record.accessToken.length < 20000 && typeof record.refreshToken === 'string' &&
    record.refreshToken.length > 8 && record.refreshToken.length < 20000 &&
    typeof record.clientId === 'string' && record.clientId.length >= 1 && record.clientId.length <= 256 &&
    record.tokenUrl === 'https://cloud.activepieces.com/token' &&
    Number.isFinite(record.expiresAt) && record.expiresAt > 0;
}
export async function sealActivepiecesCredentials(record, key) {
  if (!credentialKeyReady(key)) throw error('ACTIVEPIECES_VAULT_KEY_UNAVAILABLE');
  if (!valid(record)) throw error('ACTIVEPIECES_VAULT_RECORD_INVALID');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD },
    key, encoder.encode(JSON.stringify({
      accessToken: record.accessToken, refreshToken: record.refreshToken,
      clientId: record.clientId, tokenUrl: record.tokenUrl, expiresAt: record.expiresAt,
    })));
  return { version: 1, iv: encode64(iv), ciphertext: encode64(new Uint8Array(ciphertext)) };
}
export async function openActivepiecesCredentials(envelope, key) {
  if (!credentialKeyReady(key)) throw error('ACTIVEPIECES_VAULT_KEY_UNAVAILABLE');
  if (envelope?.version !== 1) throw error('ACTIVEPIECES_VAULT_CIPHERTEXT_INVALID');
  try {
    const iv = decode64(envelope.iv);
    if (iv.length !== 12) throw Error('IV_LENGTH');
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: AAD },
      key, decode64(envelope.ciphertext));
    const record = JSON.parse(decoder.decode(opened));
    if (!valid(record)) throw Error('RECORD_INVALID');
    return record;
  } catch {
    throw error('ACTIVEPIECES_VAULT_DECRYPTION_FAILED');
  }
}
