import { updateState } from '../storage/state.js';
function validate(id: string) { if (!id) throw new Error('missing sandbox'); }
export function pauseSandbox(id: string) {
  validate(id);
  try { return updateState(id, 'paused'); }
  catch (error) { return updateState(id, 'failed'); }
}
