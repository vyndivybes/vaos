-- Private VAOS bridge-signing key registry.
-- Secret key material is inserted out-of-band after this migration is applied.
create table if not exists vaos_private.bridge_signing_keys (
  key_id text primary key,
  algorithm text not null check (algorithm = 'ECDSA_P256_SHA256'),
  private_jwk jsonb not null,
  public_jwk jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
alter table vaos_private.bridge_signing_keys enable row level security;

comment on table vaos_private.bridge_signing_keys is
  'Private machine-signing keys for VAOS service-to-service requests. No client RLS policies.';

create or replace function public.vaos_get_bridge_signing_key(
  p_server_key text,
  p_key_id text
) returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_key vaos_private.bridge_signing_keys%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_key
    from vaos_private.bridge_signing_keys
   where key_id=p_key_id and active=true;

  if v_key.key_id is null then
    raise exception 'VAOS_BRIDGE_SIGNING_KEY_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'keyId',v_key.key_id,
    'algorithm',v_key.algorithm,
    'privateJwk',v_key.private_jwk,
    'publicJwk',v_key.public_jwk
  );
end;
$$;

revoke all on function public.vaos_get_bridge_signing_key(text,text)
  from public, anon, authenticated;
grant execute on function public.vaos_get_bridge_signing_key(text,text)
  to service_role;
