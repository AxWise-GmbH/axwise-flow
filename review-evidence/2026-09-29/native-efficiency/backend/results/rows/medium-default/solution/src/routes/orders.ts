import {Router} from '../framework/router.ts';
import {withErrors} from '../framework/errors.ts';

const audit = { get(_name: string, callback: () => Promise<string>) { return callback; } };
export const auditCallback = audit.get('orders', async () => { throw new Error('audit'); });
export function registerOrders(router: Router) {
  router.get('/orders/:id', withErrors(async (req,res) => {
    const values = await Promise.all([req.id].map(async value => value.toUpperCase()));
    if(req.fail) throw new Error('order read');
    return res.send(values[0]);
  }));
  router.delete('/orders/:id', withErrors(async (req,res) => {
    if(req.fail) throw new Error('order delete');
    return res.send('deleted:'+req.id);
  }));
}
