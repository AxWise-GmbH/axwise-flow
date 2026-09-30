import type {Handler} from './router.ts';
export function withErrors(handler: Handler): Handler {
  return async (req,res,next) => { try { return await handler(req,res,next); } catch(error) { next(error); } };
}
