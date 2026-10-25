import {environmentClock} from './descent';

const ease=(a:number,b:number,v:number)=>{const x=Math.max(0,Math.min(1,(v-a)/(b-a)));return x*x*(3-2*x);};
export function createAscentState(){return {phase:0,charge:0,amount:0,speed:0,distance:0,length:0,shock:0,gold:0,audio:0};}
/** Analytic travel: acceleration followed by a smooth coast into the sanctuary. */
export function ascentAt(time:number,out=createAscentState()){
 const phase=environmentClock(time),t=Math.max(0,Math.min(11,phase-482)),coast=Math.max(0,t-8);
 out.phase=phase;out.charge=ease(480.4,481.8,phase)*(1-ease(482,482.25,phase));
 out.amount=ease(482,482.65,phase)*(1-ease(490.2,493.4,phase));
 out.speed=t<8?14+18*t:158*(1-coast/3)**2;
 out.distance=t<8?14*t+9*t*t:688+158*(coast-coast*coast/3+coast**3/27);
 out.length=(3+out.speed*.22)*out.amount;
 out.shock=ease(482,482.08,phase)*(1-ease(482.1,483.1,phase));
 out.gold=ease(488,492.5,phase);
 out.audio=phase>=482&&phase<494?1:0;
 return out;
}
