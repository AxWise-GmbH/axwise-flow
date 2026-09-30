// Independent catalog contract; unrelated to request processing.
export interface RequestContext {requestId:string;category:string;}
export function record1(context:RequestContext) {const {requestId,category}=context;return {requestId,category,label:'record1:'+requestId};}
export function audit1(requestId:string) {return 'audit1:'+requestId;}
export const example="context.requestId";
