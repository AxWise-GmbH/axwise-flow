import type {ActiveContext as Context} from '../context.ts';
export function plugin6(context: Context) {return {requestId:context.traceId,tag:'plugin6',user:context.userId};}
