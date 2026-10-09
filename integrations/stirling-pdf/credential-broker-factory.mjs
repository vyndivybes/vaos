import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createStirlingScopedSecretResolver, STIRLING_SECRET_BINDING_REF } from './scoped-secret-resolver.mjs';

export function createStirlingCredentialBroker({ env, httpTransport, recordAudit } = {}) {
  const resolveCredential = createStirlingScopedSecretResolver({ env, httpTransport, recordAudit });
  return createCredentialBroker({ resolveCredential, recordAudit });
}

export { STIRLING_SECRET_BINDING_REF };
