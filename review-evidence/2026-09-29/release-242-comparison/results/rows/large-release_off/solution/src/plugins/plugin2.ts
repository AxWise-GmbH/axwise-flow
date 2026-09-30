import type {ActiveContext as Context} from '../context.ts';
export function plugin2(context: Context) {return {requestId:context.traceId,tag:'plugin2',user:context.userId};}
