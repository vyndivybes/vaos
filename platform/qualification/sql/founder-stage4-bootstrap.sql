-- Disposable PostgreSQL 17 fixture. Never run against production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema vaos_private;
create table vaos_private.digital_employees(id text primary key);
insert into vaos_private.digital_employees(id) values('project'),('orchestrator'),('finance');
create table vaos_private.founder_inbox_messages(
 id uuid primary key,
 sender_email text not null,
 recipient_agent_id text not null references vaos_private.digital_employees(id),
 kind text not null,
 instruction text not null,
 status text not null
);
create or replace function vaos_private.assert_server_key(p_server_key text)
returns void language plpgsql as $$
begin
 if p_server_key is distinct from 'synthetic-test-server-key' then
  raise exception 'VAOS_SERVER_KEY_INVALID' using errcode='28000';
 end if;
end; $$;
create or replace function vaos_private.reject_founder_inbox_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'FOUNDER_INBOX_IMMUTABLE'; end; $$;
insert into vaos_private.founder_inbox_messages values
('00000000-0000-4000-8000-000000000001','shyamsundhar1982@gmail.com','project','REPORT_REQUEST','Summarize mission MISSION-0001','RECORDED_NOT_ROUTED'),
('00000000-0000-4000-8000-000000000002','shyamsundhar1982@gmail.com','project','REPORT_REQUEST','Summarize mission MISSION-0001','RECORDED_NOT_ROUTED'),
('00000000-0000-4000-8000-000000000003','shyamsundhar1982@gmail.com','project','REPORT_REQUEST','Summarize mission MISSION-0001','RECORDED_NOT_ROUTED'),
('00000000-0000-4000-8000-000000000004','shyamsundhar1982@gmail.com','project','REPORT_REQUEST','Summarize mission MISSION-0001','RECORDED_NOT_ROUTED'),
('00000000-0000-4000-8000-000000000005','shyamsundhar1982@gmail.com','project','INSTRUCTION','Summarize mission MISSION-0001','RECORDED_NOT_ROUTED');
