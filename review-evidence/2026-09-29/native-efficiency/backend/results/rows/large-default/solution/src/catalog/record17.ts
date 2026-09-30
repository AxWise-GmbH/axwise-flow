// Independent catalog contract; unrelated to request processing.
export interface RequestContext {requestId:string;category:string;}
export function record17(context:RequestContext) {const {requestId,category}=context;return {requestId,category,label:'record17:'+requestId};}
export function audit17(requestId:string) {return 'audit17:'+requestId;}
export const example="context.requestId";
