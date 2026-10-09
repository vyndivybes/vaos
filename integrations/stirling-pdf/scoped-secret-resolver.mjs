import { createInfisicalSecretResolver } from '../infisical/secret-resolver.mjs';
import { createInfisicalApiTransport } from '../infisical/api-transport.mjs';

const BINDING_REF = 'stirling-pdf/api-key';
const PROVIDER_ID = 'stirling-pdf';
const CAPABILITY = 'document.transform';

export function createStirlingScopedSecretResolver({ env, httpTransport, recordAudit } = {}) {
  const clientId = env?.STIRLING_INFISICAL_CLIENT_ID;
  const clientSecret = env?.STIRLING_INFISICAL_CLIENT_SECRET;
  const projectId = env?.STIRLING_INFISICAL_PROJECT_ID;
  if (![clientId, clientSecret, projectId].every(v => typeof v === 'string' && v.trim())) {
    const error = new Error('STIRLING_INFISICAL_CONFIG_MISSING');
    error.code = 'STIRLING_INFISICAL_CONFIG_MISSING';
    throw error;
  }
  return createInfisicalSecretResolver({
    bootstrapIdentity: async () => ({ clientId, clientSecret }),
    transport: createInfisicalApiTransport({
      baseUrl: 'https://app.infisical.com',
      httpTransport,
    }),
    config: {
      leaseTtlSeconds: 900,
      bindings: {
        [BINDING_REF]: {
          projectId,
          environment: 'dev',
          secretPath: '/',
          secretKey: 'STIRLING_API_KEY',
          providerId: PROVIDER_ID,
          capabilities: [CAPABILITY],
          kind: 'api-key',
        },
      },
    },
    recordAudit,
  });
}

export const STIRLING_SECRET_BINDING_REF = BINDING_REF;
