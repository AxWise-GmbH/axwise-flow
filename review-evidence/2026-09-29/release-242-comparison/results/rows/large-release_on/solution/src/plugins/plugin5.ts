import type {ActiveContext as Context} from '../context.ts';
export function plugin5(context: Context) {return {requestId:context.traceId,tag:'plugin5',user:context.userId};}
