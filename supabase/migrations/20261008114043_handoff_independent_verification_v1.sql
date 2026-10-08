-- Hardens the existing eight-agent handoff state machine without expanding effects.
-- Recipient submits evidence; independent configured checker verifies or returns.
alter table vaos_private.agent_handoffs drop constraint if exists agent_handoff_status_check;
alter table vaos_private.agent_handoffs
  add constraint agent_handoff_status_check check (
    status in ('PENDING','ACCEPTED','SUBMITTED','INFORMATION_REQUIRED','RETURNED','ESCALATED','COMPLETED','REJECTED')
  );
alter table vaos_private.agent_handoffs
  add column if not exists verified_by_agent_id text;
alter table vaos_private.agent_handoffs
  add column if not exists verified_at timestamptz;

create or replace function public.vaos_transition_operating_handoff(
  p_server_key text,
  p_handoff_id text,
  p_expected_version integer,
  p_outcome text,
  p_by_agent_id text,
  p_reason text default null,
  p_evidence_refs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff vaos_private.agent_handoffs%rowtype;
  v_next_status text;
  v_new_evidence text[];
  v_new_version integer;
  v_wp vaos_private.work_packages%rowtype;
  v_allowed_verifiers text[];
  v_previous_event text;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_handoff
  from vaos_private.agent_handoffs
  where id=p_handoff_id
  for update;

  if not found then raise exception 'HANDOFF_NOT_FOUND'; end if;
  if p_expected_version is null or p_expected_version<>v_handoff.version then
    raise exception 'HANDOFF_VERSION_CONFLICT';
  end if;
  if jsonb_typeof(coalesce(p_evidence_refs,'null'::jsonb))<>'array' then
    raise exception 'HANDOFF_EVIDENCE_INVALID';
  end if;

  select * into v_wp from vaos_private.work_packages
  where id=v_handoff.work_package_id;
  if not found then raise exception 'HANDOFF_WORK_PACKAGE_NOT_FOUND'; end if;

  v_allowed_verifiers := case
    when cardinality(v_wp.verifier_agent_ids)>0 then v_wp.verifier_agent_ids
    when v_handoff.to_agent_id='orchestrator' then array['project']::text[]
    else array['orchestrator']::text[]
  end;

  if p_outcome='SUBMIT' and jsonb_array_length(p_evidence_refs)=0 then
    raise exception 'HANDOFF_SUBMISSION_EVIDENCE_REQUIRED';
  end if;
  if p_outcome='VERIFY' and jsonb_array_length(p_evidence_refs)=0 then
    raise exception 'HANDOFF_VERIFICATION_EVIDENCE_REQUIRED';
  end if;
  if p_outcome='REJECT_VERIFICATION' and nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'HANDOFF_VERIFICATION_REJECTION_REASON_REQUIRED';
  end if;

  v_next_status := case
    when v_handoff.status='PENDING' and p_outcome='ACCEPT' then 'ACCEPTED'
    when v_handoff.status='PENDING' and p_outcome='REQUEST_INFORMATION' then 'INFORMATION_REQUIRED'
    when v_handoff.status='PENDING' and p_outcome='REJECT_INVALID' then 'REJECTED'
    when v_handoff.status='ACCEPTED' and p_outcome='SUBMIT' then 'SUBMITTED'
    when v_handoff.status='SUBMITTED' and p_outcome='VERIFY' then 'COMPLETED'
    when v_handoff.status='SUBMITTED' and p_outcome='REJECT_VERIFICATION' then 'RETURNED'
    when v_handoff.status='ACCEPTED' and p_outcome='REQUEST_INFORMATION' then 'INFORMATION_REQUIRED'
    when v_handoff.status='ACCEPTED' and p_outcome='RETURN_FOR_CORRECTION' then 'RETURNED'
    when v_handoff.status='ACCEPTED' and p_outcome='ESCALATE' then 'ESCALATED'
    when v_handoff.status='INFORMATION_REQUIRED' and p_outcome='RESUBMIT' then 'PENDING'
    when v_handoff.status='RETURNED' and p_outcome='RESUBMIT' then 'PENDING'
    when v_handoff.status='ESCALATED' and p_outcome='RESOLVE_ESCALATION' then 'ACCEPTED'
    else null
  end;

  if v_next_status is null then raise exception 'HANDOFF_TRANSITION_INVALID'; end if;

  if p_outcome='RESUBMIT' then
    select outcome into v_previous_event
    from vaos_private.agent_handoff_events
    where handoff_id=p_handoff_id
    order by id desc limit 1;
    if p_by_agent_id <> (case when v_previous_event='REJECT_VERIFICATION'
      then v_handoff.to_agent_id else v_handoff.from_agent_id end) then
      raise exception 'HANDOFF_ACTOR_NOT_AUTHORIZED';
    end if;
  elsif p_outcome in ('VERIFY','REJECT_VERIFICATION') then
    if p_by_agent_id=v_handoff.to_agent_id
       or not (p_by_agent_id=any(v_allowed_verifiers)) then
      raise exception 'HANDOFF_VERIFIER_NOT_AUTHORIZED';
    end if;
  elsif p_outcome='RESOLVE_ESCALATION' then
    if p_by_agent_id not in ('orchestrator',v_handoff.from_agent_id) then raise exception 'HANDOFF_ACTOR_NOT_AUTHORIZED'; end if;
  else
    if p_by_agent_id<>v_handoff.to_agent_id then raise exception 'HANDOFF_ACTOR_NOT_AUTHORIZED'; end if;
  end if;

  v_new_evidence := array(
    select distinct value
    from unnest(
      coalesce(v_handoff.evidence_refs,'{}'::text[])
      || coalesce(array(select jsonb_array_elements_text(p_evidence_refs)),'{}'::text[])
    ) as value
    order by value
  );
  v_new_version := v_handoff.version+1;

  update vaos_private.agent_handoffs
  set status=v_next_status,
      version=v_new_version,
      evidence_refs=v_new_evidence,
      verified_by_agent_id=case when p_outcome='VERIFY' then p_by_agent_id else verified_by_agent_id end,
      verified_at=case when p_outcome='VERIFY' then now() else verified_at end,
      updated_at=now()
  where id=p_handoff_id;

  insert into vaos_private.agent_handoff_events(
    handoff_id,outcome,from_status,to_status,by_agent_id,reason,evidence_refs
  ) values (
    p_handoff_id,p_outcome,v_handoff.status,v_next_status,p_by_agent_id,p_reason,
    coalesce(array(select jsonb_array_elements_text(p_evidence_refs)),'{}'::text[])
  );

  update vaos_private.work_packages
  set status=case
        when v_next_status='ACCEPTED' then 'IN_PROGRESS'
        when v_next_status='COMPLETED' then 'COMPLETED'
        when v_next_status in ('INFORMATION_REQUIRED','RETURNED','ESCALATED') then 'BLOCKED'
        when v_next_status='PENDING' then 'READY'
        when v_next_status='REJECTED' then 'FAILED'
        else status
      end,
      updated_at=now()
  where id=v_handoff.work_package_id;

  update vaos_private.missions
  set status=case
        when v_next_status in ('INFORMATION_REQUIRED','RETURNED','ESCALATED','REJECTED') then 'HOLD'
        when status='HOLD' and v_next_status in ('PENDING','ACCEPTED','SUBMITTED','COMPLETED') then 'ACTIVE'
        when status='PLANNED' then 'ACTIVE'
        else status
      end,
      updated_at=now()
  where id=v_handoff.mission_id;

  return jsonb_build_object(
    'outcome','UPDATED',
    'handoff',(select to_jsonb(h) from vaos_private.agent_handoffs h where h.id=p_handoff_id)
  );
end;
$$;


revoke all on function public.vaos_transition_operating_handoff(text,text,integer,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.vaos_transition_operating_handoff(text,text,integer,text,text,text,jsonb)
  to service_role;
