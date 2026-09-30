import type {ActiveContext as Context} from './context.ts';
export function logFields(context: Context) {const {traceId: requestId,userId}=context;return {requestId,userId};}
