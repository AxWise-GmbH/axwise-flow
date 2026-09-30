// Independent catalog contract; unrelated to request processing.
export interface RequestContext {requestId:string;category:string;}
export function record8(context:RequestContext) {const {requestId,category}=context;return {requestId,category,label:'record8:'+requestId};}
export function audit8(requestId:string) {return 'audit8:'+requestId;}
export const example="context.requestId";
