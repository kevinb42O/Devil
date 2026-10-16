import type {Point} from './courtyard-state';
export const DRAWING_ROOM={minX:66,maxX:96,minZ:-14,maxZ:20};
export const DRAWING_PASSAGE={minX:58,maxX:66,minZ:-1,maxZ:5};
export const DRAWING_BOARD={x:81,z:2,size:24,cells:8};
export const MAX_INK=512;
export type Pencil={owner:string|null;pos:Point;tip:{x:number;z:number}|null};
export type DrawingState={sequence:number;pencils:Pencil[];ink:number[][]};
export const pencilDock=(index:number):Point=>({x:76+index*10,y:.05,z:17});
export function createDrawing():DrawingState{return {sequence:0,pencils:[0,1].map(i=>({owner:null,pos:pencilDock(i),tip:null})),ink:[]};}
type Artist={id:string;alive?:boolean;player:{pos:Point};input:{yaw:number;pitch?:number;fire?:boolean;homing?:boolean}};
export function onDrawingBoard(x:number,z:number){return Math.abs(x-DRAWING_BOARD.x)<=12&&Math.abs(z-DRAWING_BOARD.z)<=12;}
export function nearDrawingRoom(p:Point){return p.x>=DRAWING_ROOM.minX-2&&p.x<=DRAWING_ROOM.maxX+2&&p.z>=DRAWING_ROOM.minZ-2&&p.z<=DRAWING_ROOM.maxZ+2;}
export function pencilAction(d:DrawingState,player:Artist){
 const held=d.pencils.findIndex(p=>p.owner===player.id);
 if(held>=0){d.pencils[held]={owner:null,pos:pencilDock(held),tip:null};return true;}
 const index=d.pencils.findIndex(p=>!p.owner&&Math.hypot(p.pos.x-player.player.pos.x,p.pos.z-player.player.pos.z)<=2.8);
 if(index<0||player.player.pos.y<1||player.player.pos.y>3)return false;
 d.pencils[index].owner=player.id;return true;
}
/** Only the host writes ink. Quantized, bounded segments keep snapshots small. */
export function stepDrawing(d:DrawingState,players:Artist[],tick:number,enabled=true){
 for(const [index,pencil] of d.pencils.entries()){
  if(!pencil.owner)continue;
  const p=players.find(p=>p.id===pencil.owner&&p.alive!==false);
  if(!p||!enabled||!nearDrawingRoom(p.player.pos)){d.pencils[index]={owner:null,pos:pencilDock(index),tip:null};continue;}
  pencil.pos={x:p.player.pos.x+Math.cos(p.input.yaw)*.45-Math.sin(p.input.yaw)*.7,y:p.player.pos.y-.5,z:p.player.pos.z-Math.sin(p.input.yaw)*.45-Math.cos(p.input.yaw)*.7};
  const pitch=p.input.pitch??0,dy=Math.sin(pitch),distance=dy<-.08?-p.player.pos.y/dy:Infinity;
  const x=p.player.pos.x-Math.sin(p.input.yaw)*Math.cos(pitch)*distance,z=p.player.pos.z-Math.cos(p.input.yaw)*Math.cos(pitch)*distance;
  if(distance>12||!Number.isFinite(x)||!onDrawingBoard(x,z)||!(p.input.fire||p.input.homing)){pencil.tip=null;continue;}
  if(tick%5)continue;
  const tip={x:Math.round((x-DRAWING_BOARD.x+12)*32),z:Math.round((z-DRAWING_BOARD.z+12)*32)},last=pencil.tip;
  if(last&&Math.hypot(tip.x-last.x,tip.z-last.z)<2)continue;
  if(d.ink.length<MAX_INK){d.ink.push([index,last?.x??tip.x,last?.z??tip.z,tip.x,tip.z]);d.sequence++;}
  pencil.tip=tip;
 }
}
export function validateDrawing(d:DrawingState){
 if(!d||!Number.isSafeInteger(d.sequence)||d.sequence<0||!Array.isArray(d.pencils)||d.pencils.length!==2||!Array.isArray(d.ink)||d.ink.length>MAX_INK)return false;
 const owners=new Set<string>();
 for(const p of d.pencils){if(!p||!p.pos||![p.pos.x,p.pos.y,p.pos.z].every(Number.isFinite)||p.owner!==null&&(typeof p.owner!=='string'||!p.owner.length||p.owner.length>64||owners.has(p.owner))||p.tip!==null&&(!p.tip||![p.tip.x,p.tip.z].every(v=>Number.isInteger(v)&&v>=0&&v<=768)))return false;if(p.owner)owners.add(p.owner);}
 return d.ink.every(row=>Array.isArray(row)&&row.length===5&&(row[0]===0||row[0]===1)&&row.slice(1).every(v=>Number.isInteger(v)&&v>=0&&v<=768));
}
