import { createSupabaseControlStore } from '../../../platform/persistence/supabase-store.mjs';
import { createExecutionAdapterRegistry } from '../../../platform/execution/adapter-registry.mjs';
import { createExecutionEngine } from '../../../platform/execution/execution-engine.mjs';
import { resolveDurableControlConfig } from './durable-control-provider.mjs';
import { createVyndiReadBridgeClient } from '../../../platform/execution/vyndi-read-bridge-client.mjs';
import { createVyndiWriteQualificationClient } from '../../../platform/execution/vyndi-write-qualification-client.mjs';

let engine;

export function getExecutionEngine(runtimeEnv = undefined) {
  if (!engine) {
    const store = createSupabaseControlStore(resolveDurableControlConfig(runtimeEnv));

    const qaCapa = Object.freeze({
      openCapa(job, input) { return store.openCapa(job, input); },
      getCapa(job, capaId) { return store.getCapa(job, capaId); },
    });

    const engineeringChange = Object.freeze({
      recordBaselineChange(job, input) { return store.recordBaselineChange(job, input); },
      getBaselineChange(job, baseline) { return store.getBaselineChange(job, baseline); },
    });

    const projectRisk = Object.freeze({
      escalateRisk(job, input) { return store.escalateRisk(job, input); },
      getRiskEscalation(job, riskId) { return store.getRiskEscalation(job, riskId); },
      linkQualificationTrace(job, input) { return store.linkRiskQualificationTrace(job, input); },
    });

    const security = Object.freeze({
      observeIdentity(job, input) { return store.observeIdentity(job, input); },
      getIdentityObservation(job, observationId) { return store.getIdentityObservation(job, observationId); },
      linkQualificationTrace(job, input) { return store.linkSecurityQualificationTrace(job, input); },
    });

    const digitalThread = Object.freeze({
      linkDomainRecords(job, input) { return store.linkDomainRecords(job, input); },
      getDomainLink(job, input) { return store.getDomainLink(job, input); },
      linkKnowledgeQualification(job, input) { return store.linkKnowledgeQualification(job, input); },
      getKnowledgeQualificationLink(job, input) { return store.getKnowledgeQualificationLink(job, input); },
    });

    const digitalWorkforce = Object.freeze({
      transitionDigitalEmployee(job, input) { return store.transitionDigitalEmployee(job, input); },
      getDigitalEmployee(employeeId) { return store.getDigitalEmployee(employeeId); },
      assessDigitalEmployeeQualification(job, input) { return store.assessDigitalEmployeeQualification(job, input); },
      getQualificationAssessment(job, employeeId) { return store.getQualificationAssessment(job, employeeId); },
    });

    const vyndiBridge = runtimeEnv?.VYNDI
      ? createVyndiReadBridgeClient({
          signer: store,
          serviceBinding: runtimeEnv.VYNDI,
        })
      : undefined;
    const vyndiWriteQualification = runtimeEnv?.VYNDI
      ? createVyndiWriteQualificationClient({
          signer: store,
          serviceBinding: runtimeEnv.VYNDI,
        })
      : undefined;

    engine = createExecutionEngine({
      store,
      registry: createExecutionAdapterRegistry({
        qaCapa,
        engineeringChange,
        projectRisk,
        security,
        digitalThread,
        digitalWorkforce,
        vyndiBridge,
        vyndiWriteQualification,
      }),
      workerId: 'vaos-cloudflare-worker',
    });
  }
  return engine;
}

export function resetExecutionEngineForTest() {
  engine = undefined;
}
