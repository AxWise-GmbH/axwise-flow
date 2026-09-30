import type {ActiveContext as Context} from './context.ts';
export function logFields(context: Context) {const {traceId,userId}=context;return {requestId:traceId,userId};}
