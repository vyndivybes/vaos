-- Private, append-only independently approved VYNDI program baseline registry.
-- No fixture/automatic approval and no browser/client mutation path.
create table if not exists vaos_private.approved_program_baselines (
  approval_ref text primary key,
  project_id text not null,
  revision text not null,
  baseline jsonb not null,
  baseline_sha256 text not null,
  submitted_by text not null,
  approved_by text not null,
  approved_at timestamptz not null,
  approval_evidence_ref text not null,
  created_at timestamptz not null default now(),
  constraint approved_program_revision_unique unique (project_id,revision),
  constraint approved_schedule_digest_format check (baseline_sha256 ~ '^[0-9a-f]{64}$'),
  constraint approved_schedule_maker_checker check (length(trim(submitted_by))>0 and length(trim(approved_by))>0 and approved_by<>submitted_by),
  constraint approved_schedule_project_id check (project_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
  constraint approved_schedule_revision_format check (length(trim(revision))>0),
  constraint approved_schedule_evidence_required check (length(trim(approval_evidence_ref))>0),
  constraint approved_schedule_baseline_identity check (
    jsonb_typeof(baseline)='object'
    and baseline->>'projectId'=project_id
    and baseline->>'revision'=revision
    and baseline->>'sourceSystem'='VYNDI_OS'
    and baseline->>'schemaVersion'='vyndi.program.baseline.v1'
    and jsonb_typeof(baseline->'tasks')='array'
  )
);
alter table vaos_private.approved_program_baselines enable row level security;

create table if not exists vaos_private.approved_program_baseline_revocations (
  approval_ref text primary key references vaos_private.approved_program_baselines(approval_ref),
  revoked_by text not null check (length(trim(revoked_by))>0),
  reason text not null check (length(trim(reason))>0),
  revoked_at timestamptz not null default now()
);
alter table vaos_private.approved_program_baseline_revocations enable row level security;

-- Never allow historical approvals or revocations to be rewritten/deleted.
-- New records require a distinct, independently authorized migration/admin act.
create or replace function vaos_private.reject_schedule_approval_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'APPROVED_SCHEDULE_RECORD_IMMUTABLE';
end;
$$;
drop trigger if exists approved_program_baselines_immutable on vaos_private.approved_program_baselines;
create trigger approved_program_baselines_immutable
before update or delete on vaos_private.approved_program_baselines
for each row execute function vaos_private.reject_schedule_approval_mutation();
drop trigger if exists approved_program_baseline_revocations_immutable on vaos_private.approved_program_baseline_revocations;
create trigger approved_program_baseline_revocations_immutable
before update or delete on vaos_private.approved_program_baseline_revocations
for each row execute function vaos_private.reject_schedule_approval_mutation();

revoke all on vaos_private.approved_program_baselines from public, anon, authenticated, service_role;
revoke all on vaos_private.approved_program_baseline_revocations from public, anon, authenticated, service_role;

create or replace function public.vaos_get_approved_program_baseline(
  p_server_key text,
  p_project_id text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_record vaos_private.approved_program_baselines%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);
  if p_project_id is null or p_project_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$' then
    raise exception 'PROGRAM_PROJECT_ID_INVALID';
  end if;

  select a.* into v_record
  from vaos_private.approved_program_baselines a
  where a.project_id=p_project_id
    and not exists (
      select 1 from vaos_private.approved_program_baseline_revocations rev
      where rev.approval_ref=a.approval_ref
    )
  order by a.approved_at desc,a.revision desc
  limit 1;

  if not found then return null; end if;
  return jsonb_build_object(
    'baseline',v_record.baseline,
    'approval',jsonb_build_object(
      'source','VAOS_TRUSTED_APPROVAL_REGISTRY',
      'status','APPROVED',
      'projectId',v_record.project_id,
      'revision',v_record.revision,
      'approvedBaselineSha256',v_record.baseline_sha256,
      'submittedBy',v_record.submitted_by,
      'approvedBy',v_record.approved_by,
      'approvedAt',to_char(v_record.approved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'approvalRef',v_record.approval_ref,
      'approvalEvidenceRef',v_record.approval_evidence_ref
    )
  );
end;
$$;
revoke all on function public.vaos_get_approved_program_baseline(text,text) from public,anon,authenticated;
grant execute on function public.vaos_get_approved_program_baseline(text,text) to service_role;

comment on table vaos_private.approved_program_baselines is
 'Immutable authorized program schedule approvals; never insert a candidate as APPROVED without independent real-world governance evidence.';
