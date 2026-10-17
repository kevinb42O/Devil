import type {CourtyardState,CourtyardEvent,Point} from './courtyard-state';

export function courtyardEvent(c:CourtyardState,tick:number,kind:CourtyardEvent['kind'],pos:Point,players:string[]=[]){
 c.events.push({id:++c.sequence,tick,kind,pos:{...pos},players});if(c.events.length>24)c.events.shift();
}
