export interface Job {requestId: string; name: string;}
export function auditLabel(requestId: string) {return 'job:'+requestId;}
