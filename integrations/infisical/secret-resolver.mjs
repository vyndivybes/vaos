function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(input,key,code='INFISICAL_INPUT_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail(code,`${code}:${key}`);return v.trim()}
function clock(now){const d=now();if(!(d instanceof Date)||Number.isNaN(d.getTime()))throw fail('INFISICAL_CLOCK_INVALID');return d}
function normalizeConfig(config){
  if(!config?.bindings||typeof config.bindings!=='object'||Array.isArray(config.bindings))throw fail('INFISICAL_CONFIG_INVALID:bindings');
  const bindings={};
  for(const [ref,b] of Object.entries(config.bindings)){
    if(!ref.trim()||!b||typeof b!=='object')throw fail('INFISICAL_CONFIG_INVALID:bindings');
    const capabilities=Array.isArray(b.capabilities)&&b.capabilities.length
      ?b.capabilities.map(v=>req({v},'v','INFISICAL_CONFIG_INVALID:capabilities'))
      :(()=>{throw fail('INFISICAL_CONFIG_INVALID:capabilities')})();
    bindings[ref]=Object.freeze({
      projectId:req(b,'projectId','INFISICAL_CONFIG_INVALID'),
      environment:req(b,'environment','INFISICAL_CONFIG_INVALID'),
      secretPath:req(b,'secretPath','INFISICAL_CONFIG_INVALID'),
      secretKey:req(b,'secretKey','INFISICAL_CONFIG_INVALID'),
      providerId:req(b,'providerId','INFISICAL_CONFIG_INVALID'),
      capabilities:Object.freeze([...new Set(capabilities)]),
      kind:req(b,'kind','INFISICAL_CONFIG_INVALID'),
    });
  }
  const leaseTtlSeconds=Number(config.leaseTtlSeconds??900);
  if(!Number.isInteger(leaseTtlSeconds)||leaseTtlSeconds<1||leaseTtlSeconds>86400)throw fail('INFISICAL_CONFIG_INVALID:leaseTtlSeconds');
  return Object.freeze({bindings:Object.freeze(bindings),leaseTtlSeconds});
}

export function createInfisicalSecretResolver({
  bootstrapIdentity,
  transport,
  config,
  recordAudit=async()=>{},
  now=()=>new Date(),
}={}){
  if(typeof bootstrapIdentity!=='function')throw fail('INFISICAL_BOOTSTRAP_REQUIRED');
  if(!transport||typeof transport.universalLogin!=='function'||typeof transport.readSecret!=='function')throw fail('INFISICAL_TRANSPORT_REQUIRED');
  if(typeof recordAudit!=='function')throw fail('INFISICAL_AUDIT_INVALID');
  const cfg=normalizeConfig(config);

  return async function resolveCredential(request={}){
    const bindingRef=req(request,'bindingRef');
    const providerId=req(request,'providerId');
    const capability=req(request,'capability');
    const executionJobId=req(request,'executionJobId');
    const intentId=req(request,'intentId');

    const binding=cfg.bindings[bindingRef];
    if(!binding)throw fail('INFISICAL_BINDING_NOT_FOUND');
    if(binding.providerId!==providerId)throw fail('INFISICAL_BINDING_PROVIDER_MISMATCH');
    if(!binding.capabilities.includes(capability))throw fail('INFISICAL_BINDING_CAPABILITY_MISMATCH');

    const identity=await bootstrapIdentity();
    const clientId=req(identity,'clientId','INFISICAL_BOOTSTRAP_INVALID');
    const clientSecret=req(identity,'clientSecret','INFISICAL_BOOTSTRAP_INVALID');

    const login=await transport.universalLogin({clientId,clientSecret});
    if(!login||typeof login.accessToken!=='string'||!login.accessToken.trim())throw fail('INFISICAL_AUTH_FAILED');
    const expiresIn=Number(login.expiresIn);
    if(!Number.isFinite(expiresIn)||expiresIn<=0)throw fail('INFISICAL_AUTH_FAILED');

    const secret=await transport.readSecret({
      accessToken:login.accessToken,
      projectId:binding.projectId,
      environment:binding.environment,
      secretPath:binding.secretPath,
      secretKey:binding.secretKey,
    });
    if(!secret||typeof secret.secretValue!=='string'||!secret.secretValue)throw fail('INFISICAL_SECRET_READ_FAILED');

    const issuedAt=clock(now);
    const ttl=Math.min(cfg.leaseTtlSeconds,Math.floor(expiresIn));
    const expiresAt=new Date(issuedAt.getTime()+ttl*1000).toISOString();

    await recordAudit({
      type:'SECRET.BINDING.RESOLVED',
      bindingRef,
      providerId,
      capability,
      executionJobId,
      intentId,
      expiresAt,
      occurredAt:issuedAt.toISOString(),
    });

    return Object.freeze({
      kind:binding.kind,
      value:secret.secretValue,
      providerId,
      capabilities:binding.capabilities.slice(),
      expiresAt,
    });
  };
}
