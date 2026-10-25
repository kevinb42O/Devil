import {createDescentState,descentAt} from './descent';

const ease=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
export function createHeavenState(){return {presence:0,gate:0,throne:0,floor:0,veil:0,lift:0,clock:0,arrival:0};}
/** Absolute match time owns the reveal, including pause, rewind and later cycles. */
export function heavenAt(time:number,out=createHeavenState(),sky=createDescentState()){
 const s=descentAt(time,sky),returning=s.cycle>0&&s.phaseTime<18,t=s.phaseTime;
 out.presence=s.beyond;
 out.gate=returning?s.beyond:ease((t-489)/5);
 out.throne=returning?Math.sqrt(s.beyond):s.beyond*ease((t-494)/4);
 out.floor=returning?s.beyond:ease((t-493)/5);
 out.veil=returning?0:ease((t-491)/2)*(1-ease((t-494)/3));
 out.lift=returning?ease(t/18)*65:(ease((t-492)/6)-1)*22;
 out.clock=s.time;out.arrival=returning?1:ease((t-493)/5);
 return out;
}
