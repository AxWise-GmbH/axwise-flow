// Independent catalog contract; unrelated to request processing.
export interface RequestContext {requestId:string;category:string;}
export function record2(context:RequestContext) {const {requestId,category}=context;return {requestId,category,label:'record2:'+requestId};}
export function audit2(requestId:string) {return 'audit2:'+requestId;}
export const example="context.requestId";
