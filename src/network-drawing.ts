import {MAX_INK,validateDrawing,type DrawingState} from './courtyard-drawing';
import type {CourtyardState} from './courtyard-state';
type PackedDrawing=Omit<DrawingState,'ink'>&{ink:Uint8Array;runs:number[];relative:boolean};
export type WireCourtyard=Omit<CourtyardState,'drawing'>&{drawing?:PackedDrawing};
const same=(a:number[],b:number[])=>a.length===b.length&&a.every((v,i)=>v===b[i]);
/** Reuse immutable old runs; transmit only new/replaced segments, including eraser cuts. */
export function packDrawing(c:CourtyardState|undefined,old?:DrawingState):WireCourtyard|undefined{
 if(!c?.drawing)return c as WireCourtyard|undefined;
 const d=c.drawing,rows:number[][]=[],runs:number[]=[];
 let at=0,priorEnd=0;
 const positions=new Map<number[],number>();old?.ink.forEach((row,i)=>positions.set(row,i));
 const append=(start:number)=>{
  const last=runs.length-2;
  if(last>=0&&(start<0&&runs[last]<0||start>=0&&runs[last]>=0&&runs[last]+runs[last+1]===start))runs[last+1]++;
  else runs.push(start,1);
 };
 for(const row of d.ink){
  let index=old?positions.get(row):undefined;
  // Value equality also supports immutable clones from replay/test snapshots.
  if(index===undefined&&old?.ink[at]&&same(row,old.ink[at]))index=at;
  if(index!==undefined&&index>=priorEnd){append(index);priorEnd=index+1;at=index+1;}
  else {append(-1);rows.push(row);at++;}
 }
 // A fresh/full board is one contiguous packed run, without per-number codec overhead.
 let relative=!!old;
 if(rows.length*11+runs.length*3>=d.ink.length*11){relative=false;rows.splice(0,rows.length,...d.ink);runs.splice(0,runs.length);if(rows.length)runs.push(-1,rows.length);}
 const ink=new Uint8Array(rows.length*11),view=new DataView(ink.buffer);
 rows.forEach((row,i)=>{ink[i*11]=row[0];for(let j=1;j<5;j++)view.setUint16(i*11+1+(j-1)*2,row[j],true);view.setUint16(i*11+9,row[5]??0,true);});
 return {...c,drawing:{sequence:d.sequence,pencils:d.pencils,grid:d.grid,ink,runs,relative}};
}
export function unpackDrawing(c:WireCourtyard|undefined,old?:DrawingState):CourtyardState|undefined{
 if(!c?.drawing)return c as CourtyardState|undefined;
 const {ink,runs,relative,...state}=c.drawing;
 if(!(ink instanceof Uint8Array)||ink.length%11||ink.length>MAX_INK*11||!Array.isArray(runs)||runs.length%2||runs.length>MAX_INK*2||typeof relative!=='boolean'||relative&&!old)throw Error('Invalid drawing delta');
 const rows:number[][]=[],view=new DataView(ink.buffer,ink.byteOffset,ink.byteLength);let at=0,priorEnd=0;
 for(let i=0;i<runs.length;i+=2){
  const start=runs[i],count=runs[i+1];
  if(!Number.isInteger(start)||!Number.isInteger(count)||count<1||rows.length+count>MAX_INK)throw Error('Invalid drawing run');
  if(start===-1){
   if(at+count*11>ink.length)throw Error('Truncated drawing run');
   for(let j=0;j<count;j++){const row=[ink[at],...Array.from({length:4},(_,k)=>view.getUint16(at+1+k*2,true))],width=view.getUint16(at+9,true);if(width)row.push(width);rows.push(row);at+=11;}
  }else{
   if(!relative||start<priorEnd||!old||start+count>old.ink.length)throw Error('Invalid drawing reference');
   rows.push(...old.ink.slice(start,start+count));priorEnd=start+count;
  }
 }
 if(at!==ink.length)throw Error('Trailing drawing rows');
 const drawing={...state,ink:rows};if(!validateDrawing(drawing))throw Error('Invalid drawing');
 return {...c,drawing};
}
