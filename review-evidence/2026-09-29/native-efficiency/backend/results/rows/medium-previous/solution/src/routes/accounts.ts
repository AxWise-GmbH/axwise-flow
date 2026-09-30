import {Router} from '../framework/router.ts';
import {withErrors} from '../framework/errors.ts';

export function registerAccounts(router: Router) {
  router.get('/accounts/:id', withErrors(async (req, res) => {
    if(req.fail) throw new Error('account read');
    return res.send('account:'+req.id);
  }));
  router.post('/accounts', withErrors(async function createAccount(req, res) {
    if(req.fail) throw new Error('account create');
    return res.send('created:'+req.id);
  }));
  router.get('/health', (_req,res) => res.send('ok'));
}
export const documentation = "router.get('/fake', async handler)";
export async function unrelatedHelper() { throw new Error('helper'); }

