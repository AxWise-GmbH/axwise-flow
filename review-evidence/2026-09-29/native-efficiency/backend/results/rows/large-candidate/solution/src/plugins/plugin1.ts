import type {ActiveContext as Context} from '../context.ts';
export function plugin1(context: Context) {return {requestId:context.traceId,tag:'plugin1',user:context.userId};}
