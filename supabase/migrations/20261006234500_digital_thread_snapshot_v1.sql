create or replace function public.vaos_control_snapshot(p_server_key text)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
begin
  perform vaos_private.assert_server_key(p_server_key);

  return jsonb_build_object(
    'mode','DURABLE_POSTGRES',
    'approvals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'status',status,'agentId',agent_id,'actionType',action_type,'risk',risk,
        'authority',authority,'reason',reason,'requestedAt',requested_at,
        'decidedAt',decided_at,'decidedBy',decided_by) order by requested_at desc)
      from vaos_private.approvals
    ),'[]'::jsonb),
    'executions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'intentId',intent_id,'actionType',action_type,'status',status,
        'attemptCount',attempt_count,'maxAttempts',max_attempts,'availableAt',available_at,
        'leasedBy',leased_by,'leasedUntil',leased_until,'lastError',last_error,
        'result',result,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc)
      from (select * from vaos_private.execution_jobs order by created_at desc limit 50) x
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'sequence',sequence,'type',type,'source',source,'payload',payload,
        'occurredAt',occurred_at) order by sequence desc)
      from (select * from vaos_private.events order by sequence desc limit 100) e
    ),'[]'::jsonb),
    'domains',jsonb_build_object(
      'qaCapa',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',q.id,'resourceId',q.capa_id,'status',q.status,'recordedAt',q.opened_at,
          'intentId',i.id,'intentStatus',i.status,'intentRisk',i.risk,
          'approvalId',a.id,'approvalStatus',a.status,'decidedBy',a.decided_by,'decidedAt',a.decided_at,
          'executionJobId',j.id,'executionStatus',j.status,'attemptCount',j.attempt_count,'maxAttempts',j.max_attempts,
          'adapterId',coalesce(ev.adapter_id,fx.adapter_id,j.result->>'adapterId'),
          'evidenceCount',case when ev.verification is null then 0 else 1 end,
          'evidenceVerifiedAt',ev.verified_at,
          'effect',fx.effect,
          'evidenceVerification',ev.verification,
          'threadEvents',te.events,
          'latestEventType',le.type,'latestEventAt',le.occurred_at
        ) order by q.opened_at desc)
        from (select * from vaos_private.capa_records order by opened_at desc limit 50) q
        join vaos_private.intents i on i.id=q.intent_id
        join vaos_private.execution_jobs j on j.id=q.execution_job_id
        left join vaos_private.approvals a on a.intent_id=i.id
        left join lateral (
          select x.adapter_id,x.effect from vaos_private.execution_effects x
          where x.job_id=j.id order by x.applied_at desc limit 1
        ) fx on true
        left join lateral (
          select x.adapter_id,x.verification,x.verified_at from vaos_private.execution_evidence x
          where x.job_id=j.id order by x.verified_at desc limit 1
        ) ev on true
        left join lateral (
          select e.type,e.occurred_at from vaos_private.events e
          where e.payload->>'intentId'=i.id::text
             or (a.id is not null and e.payload->>'approvalId'=a.id::text)
             or e.payload->>'executionJobId'=j.id::text
          order by e.sequence desc limit 1
        ) le on true
        left join lateral (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',z.id,'sequence',z.sequence,'type',z.type,'source',z.source,
            'payload',z.payload,'occurredAt',z.occurred_at
          ) order by z.sequence),'[]'::jsonb) as events
          from (
            select e.id,e.sequence,e.type,e.source,e.payload,e.occurred_at
            from vaos_private.events e
            where e.payload->>'intentId'=i.id::text
               or (a.id is not null and e.payload->>'approvalId'=a.id::text)
               or e.payload->>'executionJobId'=j.id::text
            order by e.sequence desc
            limit 20
          ) z
        ) te on true
      ),'[]'::jsonb),
      'engineering',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',b.id,'resourceId',b.baseline,'status',b.status,'recordedAt',b.recorded_at,
          'intentId',i.id,'intentStatus',i.status,'intentRisk',i.risk,
          'approvalId',a.id,'approvalStatus',a.status,'decidedBy',a.decided_by,'decidedAt',a.decided_at,
          'executionJobId',j.id,'executionStatus',j.status,'attemptCount',j.attempt_count,'maxAttempts',j.max_attempts,
          'adapterId',coalesce(ev.adapter_id,fx.adapter_id,j.result->>'adapterId'),
          'evidenceCount',case when ev.verification is null then 0 else 1 end,
          'evidenceVerifiedAt',ev.verified_at,
          'effect',fx.effect,
          'evidenceVerification',ev.verification,
          'threadEvents',te.events,
          'latestEventType',le.type,'latestEventAt',le.occurred_at
        ) order by b.recorded_at desc)
        from (select * from vaos_private.engineering_baseline_changes order by recorded_at desc limit 50) b
        join vaos_private.intents i on i.id=b.intent_id
        join vaos_private.execution_jobs j on j.id=b.execution_job_id
        left join vaos_private.approvals a on a.intent_id=i.id
        left join lateral (
          select x.adapter_id,x.effect from vaos_private.execution_effects x
          where x.job_id=j.id order by x.applied_at desc limit 1
        ) fx on true
        left join lateral (
          select x.adapter_id,x.verification,x.verified_at from vaos_private.execution_evidence x
          where x.job_id=j.id order by x.verified_at desc limit 1
        ) ev on true
        left join lateral (
          select e.type,e.occurred_at from vaos_private.events e
          where e.payload->>'intentId'=i.id::text
             or (a.id is not null and e.payload->>'approvalId'=a.id::text)
             or e.payload->>'executionJobId'=j.id::text
          order by e.sequence desc limit 1
        ) le on true
        left join lateral (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',z.id,'sequence',z.sequence,'type',z.type,'source',z.source,
            'payload',z.payload,'occurredAt',z.occurred_at
          ) order by z.sequence),'[]'::jsonb) as events
          from (
            select e.id,e.sequence,e.type,e.source,e.payload,e.occurred_at
            from vaos_private.events e
            where e.payload->>'intentId'=i.id::text
               or (a.id is not null and e.payload->>'approvalId'=a.id::text)
               or e.payload->>'executionJobId'=j.id::text
            order by e.sequence desc
            limit 20
          ) z
        ) te on true
      ),'[]'::jsonb),
      'projectRisk',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,'resourceId',r.risk_id,'status',r.status,'recordedAt',r.escalated_at,
          'intentId',i.id,'intentStatus',i.status,'intentRisk',i.risk,
          'approvalId',a.id,'approvalStatus',a.status,'decidedBy',a.decided_by,'decidedAt',a.decided_at,
          'executionJobId',j.id,'executionStatus',j.status,'attemptCount',j.attempt_count,'maxAttempts',j.max_attempts,
          'adapterId',coalesce(ev.adapter_id,fx.adapter_id,j.result->>'adapterId'),
          'evidenceCount',case when ev.verification is null then 0 else 1 end,
          'evidenceVerifiedAt',ev.verified_at,
          'effect',fx.effect,
          'evidenceVerification',ev.verification,
          'threadEvents',te.events,
          'latestEventType',le.type,'latestEventAt',le.occurred_at
        ) order by r.escalated_at desc)
        from (select * from vaos_private.project_risk_escalations order by escalated_at desc limit 50) r
        join vaos_private.intents i on i.id=r.intent_id
        join vaos_private.execution_jobs j on j.id=r.execution_job_id
        left join vaos_private.approvals a on a.intent_id=i.id
        left join lateral (
          select x.adapter_id,x.effect from vaos_private.execution_effects x
          where x.job_id=j.id order by x.applied_at desc limit 1
        ) fx on true
        left join lateral (
          select x.adapter_id,x.verification,x.verified_at from vaos_private.execution_evidence x
          where x.job_id=j.id order by x.verified_at desc limit 1
        ) ev on true
        left join lateral (
          select e.type,e.occurred_at from vaos_private.events e
          where e.payload->>'intentId'=i.id::text
             or (a.id is not null and e.payload->>'approvalId'=a.id::text)
             or e.payload->>'executionJobId'=j.id::text
          order by e.sequence desc limit 1
        ) le on true
        left join lateral (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',z.id,'sequence',z.sequence,'type',z.type,'source',z.source,
            'payload',z.payload,'occurredAt',z.occurred_at
          ) order by z.sequence),'[]'::jsonb) as events
          from (
            select e.id,e.sequence,e.type,e.source,e.payload,e.occurred_at
            from vaos_private.events e
            where e.payload->>'intentId'=i.id::text
               or (a.id is not null and e.payload->>'approvalId'=a.id::text)
               or e.payload->>'executionJobId'=j.id::text
            order by e.sequence desc
            limit 20
          ) z
        ) te on true
      ),'[]'::jsonb)
    ),
    'metrics',jsonb_build_object(
      'pendingApprovals',(select count(*) from vaos_private.approvals where status='PENDING'),
      'eventCount',(select count(*) from vaos_private.events),
      'intentCount',(select count(*) from vaos_private.intents),
      'executionPending',(select count(*) from vaos_private.execution_jobs where status in ('PENDING','FAILED')),
      'executionLeased',(select count(*) from vaos_private.execution_jobs where status='LEASED'),
      'executionSucceeded',(select count(*) from vaos_private.execution_jobs where status='SUCCEEDED'),
      'executionDeadLetter',(select count(*) from vaos_private.execution_jobs where status='DEAD_LETTER'),
      'capaRecords',(select count(*) from vaos_private.capa_records),
      'engineeringChanges',(select count(*) from vaos_private.engineering_baseline_changes),
      'riskEscalations',(select count(*) from vaos_private.project_risk_escalations)
    )
  );
end;
$$;

revoke all on function public.vaos_control_snapshot(text) from public, anon, authenticated;
grant execute on function public.vaos_control_snapshot(text) to service_role;
