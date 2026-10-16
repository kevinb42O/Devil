import {createDrawing,validateDrawing,DRAWING_ROOM,DRAWING_PASSAGE,type DrawingState} from './courtyard-drawing';
/** Courtyard state is replicated independently of combat time and randomness. */
export type Point={x:number;y:number;z:number};
export type CourtyardEvent={id:number;tick:number;kind:'kick'|'bounce'|'goal'|'highfive'|'arrival'|'open'|'cancel';pos:Point;players:string[]};
export type FootballKick={started:number;released:number;power:number;right?:boolean};
export const KICK_CHARGE_TICKS=144;
export type CourtyardState={drawing?:DrawingState;generation:number;phase:'gathering'|'opening'|'open'|'collecting';phaseTick:number;participants:string[];committed:string[];events:CourtyardEvent[];sequence:number;kicks:Record<string,FootballKick>;skull:{pos:Point;vel:Point;rotation:Point;reset:number;goals:[number,number];resetAt:number;lastContact:Record<string,number>};lastRun?:{time:number;best:number;crew:string}};
export const PIT={x:0,z:2.075,half:2,depth:-3,openingTicks:180};
export const COURTYARD_BOUNDS={halfWidth:6.3,frontZ:-6.35,backZ:10.5};
export const FOOTBALL_BALL_RADIUS=.5;
export const FOOTBALL={x:36,z:2,width:36,length:50,goalHalfWidth:4.5,goalHeight:3.4,goalDepth:3,goalZ:[-20.35,24.35] as readonly number[]};
export const FOOTBALL_ROOM={minX:14,maxX:58,minZ:-28,maxZ:32};
export const FOOTBALL_PASSAGE={minX:6.3,maxX:14,minZ:PIT.z-3,maxZ:PIT.z+3};
export const COURTYARD_SOLIDS=[{x:3.3,z:-4.6,w:.85,d:.85,h:1.1},...FOOTBALL.goalZ.flatMap((z,i)=>{
 const back=z+(i?1:-1)*FOOTBALL.goalDepth;
 return [{x:FOOTBALL.x-4.38,z,w:.24,d:.24,h:3.4},{x:FOOTBALL.x+4.38,z,w:.24,d:.24,h:3.4},
 {x:FOOTBALL.x,z:back,w:9,d:.12,h:3.4},{x:FOOTBALL.x-4.44,z:(z+back)/2,w:.12,d:3,h:3.4},{x:FOOTBALL.x+4.44,z:(z+back)/2,w:.12,d:3,h:3.4}];
})];
export const COURTYARD_CAMERA_BOUNDS={halfWidth:96,frontZ:-28,backZ:32};
/** Both simulation and prediction use this connected union, including body radius. */
export function courtyardContains(x:number,z:number){
 return x>=DRAWING_ROOM.minX&&x<=DRAWING_ROOM.maxX&&z>=DRAWING_ROOM.minZ&&z<=DRAWING_ROOM.maxZ||x>=DRAWING_PASSAGE.minX&&x<=DRAWING_PASSAGE.maxX&&z>=DRAWING_PASSAGE.minZ&&z<=DRAWING_PASSAGE.maxZ||x>=-COURTYARD_BOUNDS.halfWidth&&x<=COURTYARD_BOUNDS.halfWidth&&z>=COURTYARD_BOUNDS.frontZ&&z<=COURTYARD_BOUNDS.backZ||x>=FOOTBALL_PASSAGE.minX&&x<=FOOTBALL_PASSAGE.maxX&&z>=FOOTBALL_PASSAGE.minZ&&z<=FOOTBALL_PASSAGE.maxZ||x>=FOOTBALL_ROOM.minX&&x<=FOOTBALL_ROOM.maxX&&z>=FOOTBALL_ROOM.minZ&&z<=FOOTBALL_ROOM.maxZ;
}
export function courtyardCanOccupy(x:number,z:number,radius=.22){
 return courtyardContains(x,z)&&[[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*.707,radius*.707],[-radius*.707,radius*.707],[radius*.707,-radius*.707],[-radius*.707,-radius*.707]].every(([dx,dz])=>courtyardContains(x+dx,z+dz));
}
export function constrainCourtyard(from:Point,to:Point,radius=.22){
 let x=to.x,z=to.z;
 if(!courtyardCanOccupy(x,from.z,radius))x=from.x;
 if(!courtyardCanOccupy(x,z,radius))z=from.z;
 return {x,z};
}
/** Authored stone walls are fitted to these segments; doorway is six meters wide. */
const wall=(x:number,z:number,w:number,d:number)=>({x,z,w,d,h:7});
export const FOOTBALL_WALLS=[
 wall(13.7,(-28+FOOTBALL_PASSAGE.minZ)/2,.6,FOOTBALL_PASSAGE.minZ+28),wall(13.7,(32+FOOTBALL_PASSAGE.maxZ)/2,.6,32-FOOTBALL_PASSAGE.maxZ),
 wall(58.3,-14.5,.6,27),wall(58.3,18.5,.6,27),wall(36,-28.3,44,.6),wall(36,32.3,44,.6),
 wall(62,-1.3,8,.6),wall(62,5.3,8,.6),wall(66,-7.5,.6,13),wall(66,12.5,.6,15),
 wall(81,-14.3,30.6,.6),wall(81,20.3,30.6,.6),wall(96.3,3,.6,34.6),
 wall(10.15,FOOTBALL_PASSAGE.minZ-.3,7.7,.6),wall(10.15,FOOTBALL_PASSAGE.maxZ+.3,7.7,.6),
 wall(6.6,(-6.35+FOOTBALL_PASSAGE.minZ)/2,.6,FOOTBALL_PASSAGE.minZ+6.35),wall(6.6,(10.5+FOOTBALL_PASSAGE.maxZ)/2,.6,10.5-FOOTBALL_PASSAGE.maxZ),
];
export const COURTYARD_CAMERA_BLOCKERS=[...FOOTBALL_WALLS,...COURTYARD_SOLIDS,wall(-6.6,2.075,.6,16.85),wall(0,-6.65,12.6,.6),wall(0,10.8,12.6,.6)];
export const SPAWNS=[{x:0,y:1.7,z:8},{x:-2.5,y:1.7,z:6.5},{x:2.5,y:1.7,z:6.5},{x:-3,y:1.7,z:8.5},{x:3,y:1.7,z:8.5},{x:0,y:1.7,z:10}];
/** Tile centers aligned to the same four-meter aperture as physics and the hatch. */
export const COURTYARD_FLOOR_TILES=Array.from({length:8},(_,i)=>-7+i*2).flatMap(x=>Array.from({length:11},(_,i)=>PIT.z-9+i*2).filter(z=>Math.abs(x-PIT.x)>=PIT.half||Math.abs(z-PIT.z)>=PIT.half).map(z=>({x,z})));
export function insidePit(p:Point,margin=0){return Math.abs(p.x-PIT.x)<PIT.half+margin&&Math.abs(p.z-PIT.z)<PIT.half+margin;}
export function pitIsOpen(c:CourtyardState){return c.phase==='open'||c.phase==='collecting';}
export function courtyardFloor(x:number,z:number,c:CourtyardState){
 if(pitIsOpen(c)&&insidePit({x,y:0,z}))return -1000;
 for(let i=COURTYARD_SOLIDS.length-1;i>=0;i--){const s=COURTYARD_SOLIDS[i];if(Math.abs(x-s.x)<s.w/2&&Math.abs(z-s.z)<s.d/2)return s.h;}
 return 0;
}
export function createCourtyard(generation:number,lastRun?:CourtyardState['lastRun']):CourtyardState{return {drawing:createDrawing(),generation,phase:'gathering',phaseTick:0,participants:[],committed:[],events:[],sequence:0,kicks:{},skull:{pos:{x:FOOTBALL.x,y:FOOTBALL_BALL_RADIUS,z:FOOTBALL.z},vel:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},reset:0,goals:[0,0],resetAt:0,lastContact:{}},lastRun};}
export function courtyardEvent(c:CourtyardState,tick:number,kind:CourtyardEvent['kind'],pos:Point,players:string[]=[]){c.events.push({id:++c.sequence,tick,kind,pos:{...pos},players});if(c.events.length>24)c.events.shift();}
export function resetSkull(c:CourtyardState,_players:{player:{pos:Point}}[]=[]){c.skull.pos={x:FOOTBALL.x,y:FOOTBALL_BALL_RADIUS,z:FOOTBALL.z};c.skull.vel={x:0,y:0,z:0};c.skull.rotation={x:0,y:0,z:0};c.skull.reset++;c.skull.resetAt=0;c.skull.lastContact={};}
export function footballKickPose(c:CourtyardState|undefined,id:string,tick:number){const k=c?.kicks[id];if(!k)return;const charge=k.started>=0?Math.min(1,Math.max(0,(tick-k.started)/KICK_CHARGE_TICKS)):0,age=(tick-k.released)/120;return charge>0||age>=0&&age<.5?{charge,age,power:k.power,right:k.right===true}:undefined;}

export function validateCourtyard(value:unknown):value is CourtyardState{
 if(!value||typeof value!=='object')return false;const c=value as CourtyardState;
 if(c.drawing!==undefined&&!validateDrawing(c.drawing))return false;
 const finite=(p:Point)=>p&&[p.x,p.y,p.z].every(Number.isFinite);
 const ids=(a:string[])=>Array.isArray(a)&&a.length<=6&&new Set(a).size===a.length&&a.every(s=>typeof s==='string'&&s.length<=64);
 return Number.isSafeInteger(c.generation)&&['gathering','opening','open','collecting'].includes(c.phase)&&Number.isSafeInteger(c.phaseTick)&&ids(c.participants)&&ids(c.committed)&&c.committed.every(id=>c.participants.includes(id))&&Number.isSafeInteger(c.sequence)&&!!c.kicks&&Object.keys(c.kicks).length<=6&&Object.values(c.kicks).every(k=>k&&Number.isSafeInteger(k.started)&&k.started>=-1&&Number.isSafeInteger(k.released)&&k.released>=-1000&&Number.isFinite(k.power)&&k.power>=0&&k.power<=1)&&!!c.skull&&finite(c.skull.pos)&&finite(c.skull.vel)&&finite(c.skull.rotation)&&Number.isSafeInteger(c.skull.reset)&&Number.isSafeInteger(c.skull.resetAt)&&Array.isArray(c.skull.goals)&&c.skull.goals.length===2&&c.skull.goals.every(n=>Number.isSafeInteger(n)&&n>=0)&&!!c.skull.lastContact&&Object.keys(c.skull.lastContact).length<=6&&Object.values(c.skull.lastContact).every(Number.isFinite)&&Array.isArray(c.events)&&c.events.length<=24&&c.events.every(e=>Number.isSafeInteger(e.id)&&Number.isSafeInteger(e.tick)&&['kick','bounce','goal','highfive','arrival','open','cancel'].includes(e.kind)&&finite(e.pos)&&ids(e.players))&&(!c.lastRun||Number.isFinite(c.lastRun.time)&&Number.isFinite(c.lastRun.best)&&typeof c.lastRun.crew==='string'&&c.lastRun.crew.length<=1000);
}
