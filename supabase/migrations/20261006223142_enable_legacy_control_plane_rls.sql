alter table vaos_private.server_credentials enable row level security;
alter table vaos_private.intents enable row level security;
alter table vaos_private.approvals enable row level security;
alter table vaos_private.events enable row level security;

comment on table vaos_private.server_credentials is
  'VAOS server credential hashes. RLS enabled; no client policies. Access through service-role-controlled RPC path only.';
comment on table vaos_private.intents is
  'VAOS durable intent ledger. RLS enabled; no client policies. Access through service-role-controlled RPC path only.';
comment on table vaos_private.approvals is
  'VAOS durable approval ledger. RLS enabled; no client policies. Access through service-role-controlled RPC path only.';
comment on table vaos_private.events is
  'VAOS durable governance event ledger. RLS enabled; no client policies. Access through service-role-controlled RPC path only.';
