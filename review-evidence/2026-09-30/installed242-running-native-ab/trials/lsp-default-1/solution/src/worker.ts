import {forkContext} from './context-factory.ts';
import type {RequestContext} from './context.ts';
import type {Job} from './job-types.ts';
import {describeJob} from './jobs.ts';
export function work(context: RequestContext, job: Job) {const child=forkContext(context,'worker');return describeJob(job,child);}
