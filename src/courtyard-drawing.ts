import type {Point} from './courtyard-state';
export const DRAWING_ROOM={minX:66,maxX:96,minZ:-14,maxZ:20};
export const DRAWING_PASSAGE={minX:58,maxX:66,minZ:-1,maxZ:5};
export const DRAWING_BOARD={x:81,z:2,size:24,cells:8};
export const INK_SCALE=128;
export const INK_COLORS=[0xc95b2c,0x168f88,0x24212a,0xce334f,0x3268c7,0x4a8e3f,0x995ac0,0xf2bd37];
export const BRUSH_SIZES=[4,8,16,32];
export const MAX_INK=16384;
export const TOOL_PICKUP_REACH=3.5;
export const CLEAR_BUTTON={x:95.75,y:1.7,z:7};
export function nearClearButton(pos:Point){return Math.hypot(pos.x-CLEAR_BUTTON.x,pos.z-CLEAR_BUTTON.z)<=2.8&&Math.abs(pos.y-CLEAR_BUTTON.y)<1.5;}
/** Mouse presses must aim at the wall control, not accidentally clear while drawing nearby. */
export function aimingClearButton(pos:Point,input:{yaw:number;pitch:number}){
 if(!nearClearButton(pos))return false;
 const dx=CLEAR_BUTTON.x-pos.x,dy=CLEAR_BUTTON.y-pos.y,dz=CLEAR_BUTTON.z-pos.z;
 const length=Math.hypot(dx,dy,dz),c=Math.cos(input.pitch);
 return length>0&&(-Math.sin(input.yaw)*c*dx+Math.sin(input.pitch)*dy-Math.cos(input.yaw)*c*dz)/length>.96;
}
export function nearbyTool(d:DrawingState,pos:Point){
 let nearest=-1,distance=TOOL_PICKUP_REACH;
 d.pencils.forEach((p,i)=>{const reach=Math.hypot(p.pos.x-pos.x,p.pos.z-pos.z);if(!p.owner&&reach<=distance){nearest=i;distance=reach;}});
 return nearest;
}
export const PENCIL_REACH=50;
/** Shared eye-to-floor targeting: free drawing can reach every square from anywhere beside the field. */
export function drawingTarget(pos:Point,input:{yaw:number;pitch?:number}){
 const pitch=input.pitch??0,dy=Math.sin(pitch),distance=dy<-.015?-pos.y/dy:Infinity;
 if(distance>PENCIL_REACH)return null;
 const x=pos.x-Math.sin(input.yaw)*Math.cos(pitch)*distance,z=pos.z-Math.cos(input.yaw)*Math.cos(pitch)*distance;
 return Number.isFinite(x)&&Number.isFinite(z)&&onDrawingBoard(x,z)?{x,y:.07,z}:null;
}
export type Pencil={owner:string|null;pos:Point;tip:{x:number;z:number}|null;color?:number;width?:number};
export type DrawingState={sequence:number;grid?:boolean;pencils:Pencil[];ink:number[][]};
export const pencilDock=(index:number):Point=>({x:[76,86,81][index],y:.05,z:17});
export function createDrawing():DrawingState{return {sequence:0,grid:false,pencils:[0,1,2].map(i=>({owner:null,pos:pencilDock(i),tip:null,color:i===1?1:0,width:8})),ink:[]};}
type Artist={id:string;alive?:boolean;player:{pos:Point};input:{yaw:number;pitch?:number;fire?:boolean;homing?:boolean}};
export function onDrawingBoard(x:number,z:number){return Math.abs(x-DRAWING_BOARD.x)<=12&&Math.abs(z-DRAWING_BOARD.z)<=12;}
export function nearDrawingRoom(p:Point){return p.x>=DRAWING_ROOM.minX-2&&p.x<=DRAWING_ROOM.maxX+2&&p.z>=DRAWING_ROOM.minZ-2&&p.z<=DRAWING_ROOM.maxZ+2;}
export function pencilAction(d:DrawingState,player:Artist){
 const held=d.pencils.findIndex(p=>p.owner===player.id);
 if(held>=0){d.pencils[held]={...d.pencils[held],owner:null,pos:pencilDock(held),tip:null};return true;}
 const index=nearbyTool(d,player.player.pos);
 if(index<0||player.player.pos.y<1||player.player.pos.y>3)return false;
 d.pencils[index].owner=player.id;return true;
}
/** Only the host writes ink. Quantized, bounded segments keep snapshots small. */
export function stepDrawing(d:DrawingState,players:Artist[],tick:number,enabled=true){
 for(const [index,pencil] of d.pencils.entries()){
  if(!pencil.owner)continue;
  const p=players.find(p=>p.id===pencil.owner&&p.alive!==false);
  if(!p||!enabled||!nearDrawingRoom(p.player.pos)){d.pencils[index]={...pencil,owner:null,pos:pencilDock(index),tip:null};continue;}
  const oldPosition=pencil.pos;
  pencil.pos={x:p.player.pos.x+Math.cos(p.input.yaw)*.45-Math.sin(p.input.yaw)*.7,y:p.player.pos.y-.5,z:p.player.pos.z-Math.sin(p.input.yaw)*.45-Math.cos(p.input.yaw)*.7};
  if(Math.hypot(pencil.pos.x-oldPosition.x,pencil.pos.z-oldPosition.z)>4)pencil.tip=null;
  const target=drawingTarget(p.player.pos,p.input);
  if(!target||!(p.input.fire||p.input.homing)){pencil.tip=null;continue;}
  const {x,z}=target;
  if(tick%2)continue;
  const tip={x:Math.round((x-DRAWING_BOARD.x+12)*INK_SCALE),z:Math.round((z-DRAWING_BOARD.z+12)*INK_SCALE)},previous=pencil.tip;
  // Fast brush movements stay continuous; only release or a player teleport breaks a stroke.
  const last=previous;
  if(index===2){
   // Sweep a metre-wide eraser, including movement between sampled contact points.
   const ax=(last?.x??tip.x)/INK_SCALE,az=(last?.z??tip.z)/INK_SCALE,bx=tip.x/INK_SCALE,bz=tip.z/INK_SCALE;
   const before=d.ink.length,previousInk=d.ink;
   let spare=MAX_INK-d.ink.length;
   const kept:number[][]=[];
   for(const row of d.ink){
    // Reject distant lines cheaply before detailed clipping.
    if(Math.max(row[1],row[3])/INK_SCALE<Math.min(ax,bx)-.65||Math.min(row[1],row[3])/INK_SCALE>Math.max(ax,bx)+.65||
       Math.max(row[2],row[4])/INK_SCALE<Math.min(az,bz)-.65||Math.min(row[2],row[4])/INK_SCALE>Math.max(az,bz)+.65){kept.push(row);continue;}
    const parts=eraseSegment(row,ax,az,bx,bz);
    // At capacity discard the touched fragment, never unrelated marks.
    if(parts.length>1&&spare===0){spare++;continue;}
    spare+=1-parts.length;kept.push(...parts);
   }
   d.ink=kept;
   if(d.ink.length!==before||d.ink.some((row,i)=>row!==previousInk[i]))d.sequence++;
   pencil.tip=tip;continue;
  }
  if(last&&Math.hypot(tip.x-last.x,tip.z-last.z)<1)continue;
  if(d.ink.length<MAX_INK){const row=[pencil.color??index,last?.x??tip.x,last?.z??tip.z,tip.x,tip.z,pencil.width??8];
   const prior=d.ink[d.ink.length-1];
   // Merge truly straight continuations; retain corners/curves and other artists' strokes.
   const ax=prior?prior[3]-prior[1]:0,az=prior?prior[4]-prior[2]:0,bx=tip.x-row[1],bz=tip.z-row[2];
   if(last&&prior&&prior[0]===row[0]&&prior[5]===row[5]&&prior[3]===row[1]&&prior[4]===row[2]&&
      Math.hypot(ax,az)>0&&ax*bx+az*bz>0&&Math.abs(ax*bz-az*bx)/Math.hypot(ax,az)<.35)
    d.ink[d.ink.length-1]=[prior[0],prior[1],prior[2],tip.x,tip.z,row[5]];
   else d.ink.push(row);
   d.sequence++;}
  pencil.tip=tip;
 }
}
export function validateDrawing(d:DrawingState){
 if(!d||!Number.isSafeInteger(d.sequence)||d.sequence<0||!Array.isArray(d.pencils)||d.pencils.length!==3||!Array.isArray(d.ink)||d.ink.length>MAX_INK)return false;
 if(d.grid!==undefined&&typeof d.grid!=='boolean')return false;
 const owners=new Set<string>();
 for(const p of d.pencils){if(!p||p.color!==undefined&&(!Number.isInteger(p.color)||p.color<0||p.color>=INK_COLORS.length)||p.width!==undefined&&!BRUSH_SIZES.includes(p.width)||!p.pos||![p.pos.x,p.pos.y,p.pos.z].every(Number.isFinite)||p.owner!==null&&(typeof p.owner!=='string'||!p.owner.length||p.owner.length>64||owners.has(p.owner))||p.tip!==null&&(!p.tip||![p.tip.x,p.tip.z].every(v=>Number.isInteger(v)&&v>=0&&v<=24*INK_SCALE)))return false;if(p.owner)owners.add(p.owner);}
 return d.ink.every(row=>Array.isArray(row)&&(row.length===5||row.length===6)&&Number.isInteger(row[0])&&row[0]>=0&&row[0]<INK_COLORS.length&&row.slice(1,5).every(v=>Number.isInteger(v)&&v>=0&&v<=24*INK_SCALE)&&(row[5]===undefined||BRUSH_SIZES.includes(row[5])));
}

/** Clip only the part of a line touched by the eraser, preserving both ends. */
function eraseSegment(row:number[],ax:number,az:number,bx:number,bz:number):number[][]{
 const [,x1,z1,x2,z2]=row,dx=(x2-x1)/INK_SCALE,dz=(z2-z1)/INK_SCALE,length=Math.hypot(dx,dz);
 const samples=Math.max(1,Math.ceil(length/.08)),kept:number[][]=[];let start:number|null=null,touched=false;
 const hit=(t:number)=>{
  const x=x1/INK_SCALE+dx*t,z=z1/INK_SCALE+dz*t,vx=bx-ax,vz=bz-az,den=vx*vx+vz*vz;
  const u=den?Math.max(0,Math.min(1,((x-ax)*vx+(z-az)*vz)/den)):0;
  return Math.hypot(x-ax-vx*u,z-az-vz*u)<=.65;
 };
 for(let i=0;i<=samples;i++){
  const t=i/samples;
  if(!hit(t)){if(start===null)start=t;}
  else {touched=true;if(start!==null){kept.push([row[0],Math.round(x1+dx*INK_SCALE*start),Math.round(z1+dz*INK_SCALE*start),Math.round(x1+dx*INK_SCALE*Math.max(start,(i-1)/samples)),Math.round(z1+dz*INK_SCALE*Math.max(start,(i-1)/samples))]);start=null;}}
 }
 if(!touched)return [row];
 if(start!==null)kept.push([row[0],Math.round(x1+dx*INK_SCALE*start),Math.round(z1+dz*INK_SCALE*start),x2,z2]);
 return kept.map(part=>row[5]===undefined?part:[...part,row[5]]);
}
