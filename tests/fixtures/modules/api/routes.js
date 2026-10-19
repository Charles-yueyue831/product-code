import { createInstance } from '../service/instances.js';
export function register(app) {
  app.post('/instances', (req, res) => res.json(createInstance(req.body)));
}
