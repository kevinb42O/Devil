import test from 'node:test';
import assert from 'node:assert/strict';
import {HIDE_SOLIDS,HIDE_SPOTS,HIDE_ROOM,constrainHideSolids} from '../src/courtyard-hide-and-seek';
import {courtyardCanOccupy,createCourtyard,COURTYARD_CAMERA_BLOCKERS} from '../src/courtyard-state';
import {World,idleInput} from '../src/simulation';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {encodeState,decodeState} from '../src/network-state';

const free=(x:number,z:number)=>courtyardCanOccupy(x,z)&&!HIDE_SOLIDS.some(s=>Math.abs(x-s.x)<s.w/2+.24&&Math.abs(z-s.z)<s.d/2+.24);
test('all 30 full-height hiding spots connect to spawn and the six zones',()=>{
 assert.equal(HIDE_SPOTS.length,30);assert.equal(new Set(HIDE_SPOTS.map(p=>p.zone)).size,6);
 // A .5m flood fill tests actual body clearance through both passage bends and all loops.
 const key=(x:number,z:number)=>`${x},${z}`,visited=new Set<string>(),queue=[{x:0,z:8}];visited.add(key(0,8));
 for(let n=0;n<queue.length;n++){
  const p=queue[n];for(const [dx,dz]of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){
   const x=p.x+dx,z=p.z+dz,k=key(x,z);if(x>1||x<HIDE_ROOM.minX||z< -26||z>30||visited.has(k)||!free(x,z))continue;
   visited.add(k);queue.push({x,z});
  }
 }
 for(const spot of HIDE_SPOTS){assert.ok(free(spot.x,spot.z),`${spot.id} must fit the player's body`);assert.ok(queue.some(p=>Math.hypot(p.x-spot.x,p.z-spot.z)<.7),`${spot.id} is accessible from spawn`);}
});

function blocked(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number}){
 return HIDE_SOLIDS.some(s=>{
  let enter=0,leave=1;
  for(const [axis,lo,hi]of [['x',s.x-s.w/2,s.x+s.w/2],['y',0,s.h],['z',s.z-s.d/2,s.z+s.d/2]] as const){
   const d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<lo||a[axis]>hi)return false;}else{const t1=(lo-a[axis])/d,t2=(hi-a[axis])/d;enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));}
  }return enter<leave;
 });
}
test('every pocket conceals feet, body and raised crown even from a jumping seeker',()=>{
 for(const p of HIDE_SPOTS)for(const eye of [1.7,3.26])for(const height of [.1,1.2,2.8,4.36]){
  assert.ok(blocked({...p.concealedFrom,y:eye},{x:p.x,y:height,z:p.z}),`${p.id}: silhouette ${height} / eye ${eye}`);
 }
 for(const p of HIDE_SPOTS){assert.ok(free(p.inspectFrom.x,p.inspectFrom.z),`${p.id} inspection point must be accessible`);assert.equal(blocked(p.inspectFrom,{x:p.x,y:1.7,z:p.z}),false,`${p.id} is visible from its inspection route`);}
});
test('swept solids stop fast crossings and allow sliding along the new cover',()=>{
 const from={x:-64,y:1.7,z:-20},to={x:-63,y:1.7,z:-16};
 const next=constrainHideSolids(from,to);assert.equal(next.x,to.x);assert.ok(next.z<=-18-.325-.22);
 const crossing=constrainHideSolids({x:-60,y:1.7,z:-30},{x:-60,y:1.7,z:-20});assert.ok(crossing.z< -26);
 assert.ok(HIDE_SOLIDS.every(s=>COURTYARD_CAMERA_BLOCKERS.includes(s)));
});
test('walking, jump pressure and host/guest snapshots agree inside the west wing',()=>{
 const w=new World(1,{schedule:false});w.courtyard=createCourtyard(1);w.player.pos={x:-64,y:1.7,z:-20};
 for(let i=0;i<240;i++)w.stepEntrance({...idleInput(),forward:-1,jump:i%50===0});
 assert.ok(w.player.pos.z<=-18-.325-.22+.0001,'jumping cannot pass through a tall screen');
 const host=new FriendsSession('host'),guest=new FriendsSession('guest');
 try{
  host.enterPrelobby();host.world!.addCrew('guest');host.world!.crew[1].player.pos={x:-75,y:1.7,z:-16.6};
  const snapshot=decodeState(encodeState(host.snapshot()!,1,0),new Map())!.snapshot;
  const replica=new World(1,{schedule:false});applySnapshot(replica,snapshot,'guest');assert.equal(replica.player.pos.x,-75);assert.ok(replica.courtyard);
 }finally{host.close();guest.close();}
});
