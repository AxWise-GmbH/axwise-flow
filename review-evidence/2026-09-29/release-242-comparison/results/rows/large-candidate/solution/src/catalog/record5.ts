// Independent catalog contract; unrelated to request processing.
export interface RequestContext {requestId:string;category:string;}
export function record5(context:RequestContext) {const {requestId,category}=context;return {requestId,category,label:'record5:'+requestId};}
export function audit5(requestId:string) {return 'audit5:'+requestId;}
export const example="context.requestId";
