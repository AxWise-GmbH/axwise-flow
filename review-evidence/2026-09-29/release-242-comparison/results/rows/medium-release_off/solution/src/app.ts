import {Router} from './framework/router.ts';
import {registerAccounts} from './routes/accounts.ts';
import {registerOrders} from './routes/orders.ts';
export function makeRouter() {const router=new Router();registerAccounts(router);registerOrders(router);return router;}
