-- Align the Risk Digital Employee with its implemented Q3 enterprise-risk qualification profile.
update vaos_private.digital_employees
set model_requirements = jsonb_set(
      coalesce(model_requirements,'{}'::jsonb),
      '{minimumQualification}',
      '"Q3_ENTERPRISE_RISK"'::jsonb,
      true
    ),
    updated_at = now()
where id='risk';
