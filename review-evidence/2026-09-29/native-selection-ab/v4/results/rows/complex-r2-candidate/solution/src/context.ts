export interface RequestContext { readonly traceId: string; readonly userId: string; }
export type ActiveContext = RequestContext;
