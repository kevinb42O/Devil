import {encodePacket,decodePacket,presentationPrecision} from './network-codec';
import type {Effect} from './simulation';

const kinds=new Set<Effect['kind']>(['shot','burst','hit','kill','pickup','upgrade','spawn','jump','death','egg','beckon','transmute','explosion','land','impact','ricochet','pierce','eat','bounce','hatch','burrow','emerge']);
/** Keep the reliable control envelope, but intern repeated effect fields and
 * shooter IDs instead of repeating long JSON floats/identities for every hit. */
export function encodeEffects(epoch:number,events:Effect[]):string{
 if(events.length>24)throw Error('Too many effects');
 const rows=events.map(e=>({...e,pos:presentationPrecision(e.pos),direction:presentationPrecision(e.direction),muzzles:presentationPrecision(e.muzzles),bloodSources:presentationPrecision(e.bloodSources),shotKey:e.shotKey?.split(':').map((p,i)=>i>0&&/^(0|[1-9]\d*)$/.test(p)&&Number.isSafeInteger(Number(p))?Number(p):p)}));
 const bytes=encodePacket(rows);
 if(bytes.length>14000)throw Error('Effects packet too large');
 return JSON.stringify({type:'effects',epoch,packed:btoa(String.fromCharCode(...bytes))});
}
export function decodeEffects(value:unknown):{epoch:number;events:Effect[]}|null{
 if(!value||typeof value!=='object')return null;const message=value as {type?:string;epoch?:number;events?:unknown;packed?:unknown};
 if(message.type!=='effects'||!Number.isSafeInteger(message.epoch)||message.epoch!<0)return null;
 let rows:unknown=message.events;
 if(message.packed!==undefined){if(typeof message.packed!=='string'||message.packed.length>19000)throw Error('Invalid effects packet');const raw=atob(message.packed);rows=decodePacket(Uint8Array.from(raw,c=>c.charCodeAt(0)));}
 if(!Array.isArray(rows)||rows.length>24)throw Error('Invalid effects batch');
 const events=rows.map(row=>{
  if(!row||typeof row!=='object')throw Error('Invalid effect');const e={...row} as Effect&{shotKey:unknown};
  if(Array.isArray(e.shotKey)){if(e.shotKey.length>8||e.shotKey.some(p=>typeof p==='string'?p.includes(':'):!Number.isSafeInteger(p)||p<0))throw Error('Invalid effect identity');e.shotKey=e.shotKey.join(':');}
  if(!kinds.has(e.kind)||!Number.isSafeInteger(e.networkId)||e.networkId!<1||!e.pos||![e.pos.x,e.pos.y,e.pos.z].every(Number.isFinite)||e.shotKey!==undefined&&(typeof e.shotKey!=='string'||e.shotKey.length>180))throw Error('Invalid effect');
  return e as Effect;
 });
 return {epoch:message.epoch!,events};
}
