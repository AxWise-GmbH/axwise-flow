import type {ActiveContext as Context} from '../context.ts';
export function plugin0(context: Context) {return {requestId:context.traceId,tag:'plugin0',user:context.userId};}
