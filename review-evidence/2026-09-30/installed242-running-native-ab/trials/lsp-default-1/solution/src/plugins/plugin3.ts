import type {ActiveContext as Context} from '../context.ts';
export function plugin3(context: Context) {return {requestId:context.traceId,tag:'plugin3',user:context.userId};}
