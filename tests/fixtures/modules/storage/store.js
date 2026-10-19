const rows = new Map();
export function saveInstance(instance) { rows.set(instance.name, instance); return instance; }
