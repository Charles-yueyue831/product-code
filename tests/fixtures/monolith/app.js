function validate(order) { if (!order.id) throw new Error('missing id'); }
function persist(order) { return { ...order, state: 'stored' }; }
export function createOrder(order) { validate(order); return persist(order); }
