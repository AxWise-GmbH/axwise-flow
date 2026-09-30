import type {RequestContext} from './context.ts';
export function headers(context: RequestContext) {return {'x-request-id':context.requestId};}
