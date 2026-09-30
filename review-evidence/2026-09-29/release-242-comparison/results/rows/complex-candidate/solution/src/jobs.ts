import type {RequestContext} from './context.ts';
import {auditLabel} from './job-types.ts';
import type {Job} from './job-types.ts';
export function describeJob(job: Job, context: RequestContext) {return {requestId:job.requestId,trace:context.traceId,audit:auditLabel(job.requestId),name:job.name};}
