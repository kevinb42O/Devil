import {WORLD_SCALE} from './arena';
import {TOWER_ENTRANCE} from './tower-entrance-data';
import {type EnemyKind} from './enemy-kinds';

type Sample=readonly [number,number,number];
function slope(samples:readonly Sample[],i:number,column:1|2){
 const secant=(a:number,b:number)=>(samples[b][column]-samples[a][column])/(samples[b][0]-samples[a][0]);
 if(i===0)return secant(0,1);
 if(i===samples.length-1)return column===2?0:secant(i-1,i);
 const before=secant(i-1,i),after=secant(i,i+1);
 if(before*after<=0)return 0;
 const h0=samples[i][0]-samples[i-1][0],h1=samples[i+1][0]-samples[i][0];
 return 3*(h0+h1)/((2*h1+h0)/before+(h1+2*h0)/after);
}
/** Shape-preserving interpolation of measured poses, not recovered engine code.
 * Continue with the measured steady radial speed after the entrance interval. */
export function towerEntrancePose(kind:EnemyKind,age:number){
 const samples=TOWER_ENTRANCE[kind as keyof typeof TOWER_ENTRANCE],tick=Math.max(0,age*60),last=samples.length-1;
 if(tick>=samples[last][0])return {radius:Math.max(0,samples[last][1]+slope(samples,last,1)*(tick-samples[last][0]))*WORLD_SCALE,height:samples[last][2]*WORLD_SCALE};
 let i=0;while(samples[i+1][0]<tick)i++;
 const a=samples[i],b=samples[i+1],h=b[0]-a[0],u=(tick-a[0])/h,u2=u*u,u3=u2*u;
 const value=(column:1|2)=>(2*u3-3*u2+1)*a[column]+(u3-2*u2+u)*h*slope(samples,i,column)+(-2*u3+3*u2)*b[column]+(u3-u2)*h*slope(samples,i+1,column);
 return {radius:value(1)*WORLD_SCALE,height:value(2)*WORLD_SCALE};
}
/** Match the large tower's underside to the small tower's floor clearance.
 * Their imported bottoms are -2.812 and -3.229 world units respectively.
 * Keep the large tower's measured radial travel, using the small tower's lift. */
export function towerGameplayEntrancePose(kind:EnemyKind,age:number){
 const pose=towerEntrancePose(kind,age);
 if(kind==='squid3')pose.height=towerEntrancePose('squid',age).height-.417;
 return pose;
}
/** Recovered from emitted child ticks in both original recordings. */
export function towerEmissionTick(kind:EnemyKind,burst:number,index:number){return 184+burst*(kind==='squid3'?1231:1222)+Math.floor(index*9/5);}
