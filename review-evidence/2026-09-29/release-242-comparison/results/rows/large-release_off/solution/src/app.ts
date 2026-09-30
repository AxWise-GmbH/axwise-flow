import {createContext} from './context-factory.ts';
import {headers} from './middleware.ts';
import {logFields} from './logging.ts';
import {response} from './response.ts';
import {work} from './worker.ts';
import type {Job} from './job-types.ts';
export function handle(trace: string,user: string,job: Job) {const context=createContext(trace,user);return {context,headers:headers(context),logs:logFields(context),body:response(context,work(context,job))};}
