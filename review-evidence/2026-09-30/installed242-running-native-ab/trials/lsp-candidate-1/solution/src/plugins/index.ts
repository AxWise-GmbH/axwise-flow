import {plugin0} from './plugin0.ts';
import {plugin1} from './plugin1.ts';
import {plugin2} from './plugin2.ts';
import {plugin3} from './plugin3.ts';
import {plugin4} from './plugin4.ts';
import {plugin5} from './plugin5.ts';
import {plugin6} from './plugin6.ts';
import {plugin7} from './plugin7.ts';
import type {RequestContext} from '../context.ts';
export function traceSummary(context:RequestContext) {return [plugin0(context),plugin1(context),plugin2(context),plugin3(context),plugin4(context),plugin5(context),plugin6(context),plugin7(context),];}
