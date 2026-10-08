import { DurableObject } from 'cloudflare:workers';
import { createWindmillDurableLedger } from '../../integrations/windmill/durable-ledger.mjs';
import { createWindmillIsolatedDrill } from './windmill-isolated-drill.mjs';

/**
 * VAOS singleton Windmill admission coordinator.
 * SQLite-backed storage is authoritative across Worker processes/restarts.
 * There is deliberately no public HTTP fetch handler.
 */
export class WindmillAdmissionCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ledger = createWindmillDurableLedger({ store: ctx.storage });
  }
  assertEnabled() {
    if (this.env.WINDMILL_ADMISSION_ENABLED !== 'true') {
      throw new Error('WINDMILL_ADMISSION_DISABLED');
    }
  }
  async status() { return this.ledger.snapshot(); }
  isolatedDrill() {
    return createWindmillIsolatedDrill({
      store:this.ctx.storage,
      setAlarm:at=>this.ctx.storage.setAlarm(at),
    });
  }
  async startQualification(runId) { return this.isolatedDrill().start(runId); }
  async finishQualification(runId) { return this.isolatedDrill().finish(runId); }
  async reserve(request) {
    this.assertEnabled();
    const value = await this.ledger.reserve(request);
    if (value.status === 'GRANTED') await this.ctx.storage.setAlarm(value.deadlineMs);
    return value;
  }
  async beginDispatch(request) { this.assertEnabled(); return this.ledger.beginDispatch(request); }
  async recordProviderRun(request) { this.assertEnabled(); return this.ledger.recordProviderRun(request); }
  async requestCancellation(request) { this.assertEnabled(); return this.ledger.requestCancellation(request); }
  async finish(request) { this.assertEnabled(); return this.ledger.finish(request); }
  async alarm() { await this.ledger.expire(); }
}
