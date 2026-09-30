import type {ActiveContext as Context} from '../context.ts';
export function plugin7(context: Context) {return {requestId:context.traceId,tag:'plugin7',user:context.userId};}
