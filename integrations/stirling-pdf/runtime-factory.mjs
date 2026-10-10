import { createStirlingCredentialBroker, STIRLING_SECRET_BINDING_REF } from './credential-broker-factory.mjs';
import { createStirlingTransformAdapter } from './transform-adapter.mjs';

// This factory is intentionally not an HTTP route. Callers must supply governed
// artifact ports, a qualified capability registry and an approved transport.
export function createStirlingRuntime({
  env, httpTransport, capabilityRegistry, artifactReader, artifactBroker,
  transformTransport, baseUrl, recordAudit,
} = {}) {
  if (env?.STIRLING_PRODUCTION_ROUTING !== 'qualified') {
    const error = new Error('STIRLING_PRODUCTION_ROUTING_DISABLED');
    error.code = 'STIRLING_PRODUCTION_ROUTING_DISABLED';
    throw error;
  }
  if (typeof baseUrl !== 'string' || !baseUrl.startsWith('https://')) {
    const error = new Error('STIRLING_BASE_URL_REQUIRED');
    error.code = 'STIRLING_BASE_URL_REQUIRED';
    throw error;
  }
  return createStirlingTransformAdapter({
    capabilityRegistry,
    credentialBroker: createStirlingCredentialBroker({env,httpTransport,recordAudit}),
    artifactReader,
    artifactBroker,
    transport:transformTransport,
    config:{
      baseUrl,
      secretBindingRef:STIRLING_SECRET_BINDING_REF,
      timeoutMs:60000,
      operations:{
        'pdf.rotate-90':{
          endpointPath:'/api/v1/general/rotate-pdf',
          operation:'rotate-pdf',
          inputContentTypes:['application/pdf'],
          outputContentType:'application/pdf',
          allowedOptions:['angle'],
          deterministic:true,
          maxOutputBytes:16777216,
        },
      },
    },
  });
}
