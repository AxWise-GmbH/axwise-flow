// Independent catalog contract; unrelated to request processing.
export interface RequestContext {requestId:string;category:string;}
export function record3(context:RequestContext) {const {requestId,category}=context;return {requestId,category,label:'record3:'+requestId};}
export function audit3(requestId:string) {return 'audit3:'+requestId;}
export const example="context.requestId";
