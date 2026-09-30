// Independent catalog contract; unrelated to request processing.
export interface RequestContext {requestId:string;category:string;}
export function record6(context:RequestContext) {const {requestId,category}=context;return {requestId,category,label:'record6:'+requestId};}
export function audit6(requestId:string) {return 'audit6:'+requestId;}
export const example="context.requestId";
