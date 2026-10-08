const fail = code => Object.assign(new Error(code), { code });
const required = (value, code) => {
  if (typeof value !== 'string' || !value.trim()) throw fail(code);
  return value.trim();
};

/**
 * Read-only credential preflight. The Windmill token and Infisical access token
 * never escape this function. No Windmill job is dispatched.
 */
export async function verifyWindmillInfisicalCredential({
  transport, clientId, clientSecret, projectId, qualificationProjectId,
} = {}) {
  if (!transport || typeof transport.universalLogin !== 'function' ||
      typeof transport.readSecret !== 'function') throw fail('WINDMILL_INFISICAL_TRANSPORT_REQUIRED');
  clientId = required(clientId, 'WINDMILL_INFISICAL_ID_MISSING');
  clientSecret = required(clientSecret, 'WINDMILL_INFISICAL_CLIENT_SECRET_MISSING');
  projectId = required(projectId, 'WINDMILL_INFISICAL_PROJECT_ID_MISSING');
  qualificationProjectId = required(qualificationProjectId, 'WINDMILL_INFISICAL_QUALIFICATION_PROJECT_ID_MISSING');
  if (projectId === qualificationProjectId) throw fail('WINDMILL_INFISICAL_PROJECT_NOT_ISOLATED');

  const login = await transport.universalLogin({ clientId, clientSecret });
  const accessToken = required(login?.accessToken, 'WINDMILL_INFISICAL_AUTH_FAILED');
  const ttl = Number(login?.expiresIn);
  const maxTtl = Number(login?.accessTokenMaxTTL ?? ttl);
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 3600 ||
      !Number.isFinite(maxTtl) || maxTtl < 1 || maxTtl > 3600) {
    throw fail('WINDMILL_INFISICAL_TTL_UNSAFE');
  }

  const credential = await transport.readSecret({
    accessToken,
    projectId,
    environment: 'prod',
    secretPath: '/',
    secretKey: 'WINDMILL_API_TOKEN',
  });
  if (typeof credential?.secretValue !== 'string' || !credential.secretValue.trim()) {
    throw fail('WINDMILL_CREDENTIAL_MISSING');
  }

  // Fail closed if the production identity can read the qualification canary.
  let denied = false;
  try {
    await transport.readSecret({
      accessToken,
      projectId: qualificationProjectId,
      environment: 'dev',
      secretPath: '/vaos/allowed',
      secretKey: 'CANARY',
    });
  } catch (error) {
    if (['INFISICAL_SECRET_FORBIDDEN', 'INFISICAL_SECRET_NOT_FOUND'].includes(error?.code)) {
      denied = true;
    } else {
      throw fail('WINDMILL_INFISICAL_ISOLATION_UNVERIFIED');
    }
  }
  if (!denied) throw fail('WINDMILL_INFISICAL_ISOLATION_FAILED');

  return Object.freeze({
    status: 'PASS',
    auth: 'PASS',
    credentialRead: 'PASS',
    qualificationIsolation: 'PASS',
    accessTokenTtlSeconds: ttl,
  });
}
