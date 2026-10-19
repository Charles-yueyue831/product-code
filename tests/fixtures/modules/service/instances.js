import { saveInstance } from '../storage/store.js';
export function createInstance(input) { return saveInstance({ name: input.name, state: 'ready' }); }
