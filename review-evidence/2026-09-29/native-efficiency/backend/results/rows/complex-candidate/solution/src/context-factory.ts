import type {RequestContext} from './context.ts';
export function createContext(value: string, userId: string): RequestContext {return {traceId:value,userId};}
export function forkContext(context: RequestContext, suffix: string): RequestContext {return {...context, traceId: context.traceId+'/'+suffix};}
