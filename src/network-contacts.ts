import {encodePacket,decodePacket} from './network-codec';
import type {Vec} from './simulation';

/** The shooter's browser owns physical contact; the host owns shared damage. */
export type ProjectileContact={serial?:number;damage?:number;killed?:boolean;shotKey:string;enemyId:number;segment:number;weak:boolean;kind:'hit'|'impact'|'eat';pos:Vec;direction:Vec};
export function validContact(c:unknown):c is ProjectileContact{
 if(!c||typeof c!=='object')return false;const p=c as ProjectileContact;
 return typeof p.shotKey==='string'&&/^[\w-]{1,64}:\d+:\d+$/.test(p.shotKey)&&Number.isSafeInteger(p.enemyId)&&p.enemyId>0&&Number.isInteger(p.segment)&&p.segment>=-1&&p.segment<1000&&typeof p.weak==='boolean'&&['hit','impact','eat'].includes(p.kind)&&!!p.pos&&!!p.direction&&[p.pos.x,p.pos.y,p.pos.z,p.direction.x,p.direction.y,p.direction.z].every(Number.isFinite)&&(p.serial===undefined||Number.isSafeInteger(p.serial)&&p.serial>0);
}
export function encodeContacts(epoch:number,contacts:ProjectileContact[]):string{
 if(contacts.length>24||contacts.some(c=>!validContact(c)))throw Error('Invalid contacts');
 const rows=contacts.map(c=>{const [,shot,index]=c.shotKey.split(':');return [Number(shot),Number(index),c.enemyId,c.segment,(c.kind==='hit'?0:c.kind==='impact'?1:2)|(c.weak?4:0),new Float32Array([c.pos.x,c.pos.y,c.pos.z,c.direction.x,c.direction.y,c.direction.z]),c.serial??0];});
 const bytes=encodePacket(rows);return JSON.stringify({type:'contacts',epoch,packed:btoa(String.fromCharCode(...bytes))});
}
export function decodeContacts(message:{packed?:unknown},owner:string):ProjectileContact[]{
 if(typeof message.packed!=='string'||message.packed.length>10000||!/^[\w-]{1,64}$/.test(owner))throw Error('Invalid contacts');
 const raw=atob(message.packed),rows=decodePacket(Uint8Array.from(raw,c=>c.charCodeAt(0)));
 if(!Array.isArray(rows)||rows.length>24)throw Error('Invalid contacts');
 return rows.map(row=>{
  if(!Array.isArray(row)||row.length!==7)throw Error('Invalid contact');const [shot,index,enemyId,segment,flags,values,serial]=row;
  if(!Number.isSafeInteger(serial)||serial<0)throw Error('Invalid contact sequence');
  if(!Number.isSafeInteger(shot)||shot<1||!Number.isSafeInteger(index)||index<0||!Number.isInteger(flags)||flags<0||flags>6||(flags&3)>2||!(values instanceof Float32Array)||values.length!==6)throw Error('Invalid contact');
  const [x,y,z,dx,dy,dz]=values,c:ProjectileContact={...(serial?{serial}:{}),shotKey:`${owner}:${shot}:${index}`,enemyId,segment,weak:!!(flags&4),kind:(flags&3)===0?'hit':(flags&3)===1?'impact':'eat',pos:{x,y,z},direction:{x:dx,y:dy,z:dz}};
  if(!validContact(c))throw Error('Invalid contact');return c;
 });
}
