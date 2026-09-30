import type {ActiveContext as Context} from '../context.ts';
export function plugin4(context: Context) {return {requestId:context.traceId,tag:'plugin4',user:context.userId};}
