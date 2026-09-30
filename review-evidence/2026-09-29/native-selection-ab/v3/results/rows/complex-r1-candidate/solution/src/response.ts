import type {ActiveContext} from './context.ts';
export function response(context: ActiveContext, payload: unknown) {return {requestId:context.requestId,payload};}
