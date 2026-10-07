-- Cloudflare-only runtime identity for the VAOS server credential.
do $$
begin
  if exists (
    select 1 from vaos_private.server_credentials
    where credential_id = 'cloudflare-primary'
  ) then
    null;
  elsif (select count(*) from vaos_private.server_credentials) = 1 then
    update vaos_private.server_credentials
    set credential_id = 'cloudflare-primary';
  else
    raise exception 'VAOS_RUNTIME_CREDENTIAL_AMBIGUOUS';
  end if;
end;
$$;

create or replace function vaos_private.assert_server_key(p_server_key text)
returns void
language plpgsql
set search_path = vaos_private, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  select key_hash into v_hash
  from vaos_private.server_credentials
  where credential_id = 'cloudflare-primary';

  if v_hash is null
     or encode(extensions.digest(convert_to(coalesce(p_server_key,''),'UTF8'),'sha256'),'hex') <> v_hash then
    raise exception 'VAOS_SERVER_KEY_INVALID' using errcode='28000';
  end if;
end;
$$;

revoke all on function vaos_private.assert_server_key(text)
from public, anon, authenticated, service_role;
