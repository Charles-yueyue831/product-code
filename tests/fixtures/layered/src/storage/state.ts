const states = new Map<string, string>();
export function updateState(id: string, state: string) { states.set(id, state); return { id, state }; }
