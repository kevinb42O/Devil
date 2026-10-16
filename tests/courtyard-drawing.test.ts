import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrawing,pencilDock,pencilAction,stepDrawing,validateDrawing,MAX_INK,DRAWING_BOARD,CLEAR_BUTTON,aimingClearButton} from '../src/courtyard-drawing';
import {packDrawing,unpackDrawing} from '../src/network-drawing';
import {courtyardCanOccupy} from '../src/courtyard-state';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {encodeState,decodeState,snapshotBaseline} from '../src/network-state';
import {World,idleInput} from '../src/simulation';
const artist=(id:string,index=0)=>({id,alive:true,player:{pos:{...pencilDock(index),y:1.7}},input:{...idleInput(),pitch:-1}});
test('8x8 court connects to football through a walkable passage with closed outer walls',()=>{
 assert.equal(DRAWING_BOARD.cells,8);
 for(let x=55;x<=95;x+=.2)assert.ok(courtyardCanOccupy(x,2),'connected eastward route');
 assert.equal(courtyardCanOccupy(62,8),false);assert.equal(courtyardCanOccupy(97,2),false);
});
test('two pencils have exclusive owners; remote pickups fail; dropping and departures return pencils',()=>{
 const d=createDrawing(),a=artist('a'),b=artist('b');
 assert.equal(pencilAction(d,a),true);assert.equal(pencilAction(d,b),false);
 b.player.pos={...pencilDock(1),y:1.7};assert.equal(pencilAction(d,b),true);
 assert.deepEqual(d.pencils.map(p=>p.owner),['a','b',null]);
 assert.equal(pencilAction(d,a),true);assert.equal(d.pencils[0].owner,null);
 stepDrawing(d,[],5);assert.ok(d.pencils.every(p=>!p.owner));
 assert.equal(pencilAction(d,artist('far')),true);
 const far=artist('remote');far.player.pos.x=0;assert.equal(pencilAction(d,far),false);
});
test('freehand ink follows floor aim, separates strokes and stays bounded and validated',()=>{
 const d=createDrawing(),a=artist('a');pencilAction(d,a);a.player.pos.z=10;a.input.fire=true;
 stepDrawing(d,[a],6);assert.equal(d.ink.length,1);
 a.input.yaw=.2;stepDrawing(d,[a],10);assert.equal(d.ink.length,2);assert.deepEqual(d.ink[1].slice(1,3),d.ink[0].slice(3,5));
 a.input.fire=false;stepDrawing(d,[a],11);a.input.fire=true;a.input.yaw=-.2;stepDrawing(d,[a],16);
 assert.deepEqual(d.ink[2].slice(1,3),d.ink[2].slice(3,5),'new stroke has no connecting line');
 a.input.pitch=.2;stepDrawing(d,[a],20);assert.equal(d.ink.length,3,'looking above floor never writes');
 for(let i=0;i<MAX_INK+10;i++){a.input.pitch=-1;a.input.yaw=i%2?.3:-.3;stepDrawing(d,[a],26+i*2);}
 assert.equal(d.ink.length,MAX_INK);assert.equal(validateDrawing(d),true);
 d.ink[0][1]=Infinity;assert.equal(validateDrawing(d),false);
});
test('authoritative pencil interaction, drawing, snapshot roundtrip and fresh courtyard reset',()=>{
 const h=new FriendsSession('host');try{
  h.enterPrelobby();h.world!.player.pos={...pencilDock(0),y:1.7};assert.equal(h.pencilAction(),true);
  h.world!.player.pos.z=10;
  for(let i=0;i<20;i++)h.step({...idleInput(),pitch:-1,fire:true,yaw:i*.01});
  const drawing=h.courtyard!.drawing!;assert.ok(drawing.ink.length>0);
  const encoded=encodeState(h.snapshot()!,1,0),decoded=decodeState(encoded,new Map())!;
  assert.ok(encoded.length<16000);assert.deepEqual(structuredClone(decoded.snapshot.courtyard!.drawing),drawing);
  const guest=new World(1);applySnapshot(guest,decoded.snapshot,'host');assert.deepEqual(guest.courtyard!.drawing,drawing);
  drawing.ink=Array.from({length:MAX_INK},(_,i)=>[i%2,768,768,767,767]);
  assert.ok(encodeState(h.snapshot()!,2,0).length<190000,'even a full board fits a packed recovery snapshot');
  h.returnToLobby();assert.equal(h.courtyard!.drawing!.ink.length,0);assert.ok(h.courtyard!.drawing!.pencils.every(p=>!p.owner));
 }finally{h.close();}
});

test('upward aim cannot draw; player teleports never bridge strokes',()=>{
 const d=createDrawing(),a=artist('a');pencilAction(d,a);a.player.pos.z=10;a.input.fire=true;
 a.input.pitch=.2;stepDrawing(d,[a],6);assert.equal(d.ink.length,0);
 a.input.pitch=-1;stepDrawing(d,[a],10);a.player.pos.x=90;stepDrawing(d,[a],16);
 assert.equal(d.ink.length,2);assert.deepEqual(d.ink[1].slice(1,3),d.ink[1].slice(3,5));
});
test('host clearing the board keeps the pencil in the hand and separates the next stroke',()=>{
 const h=new FriendsSession('host');try{
  h.enterPrelobby();h.world!.player.pos={...pencilDock(0),y:1.7};assert.ok(h.pencilAction());
  h.world!.player.pos.z=10;for(let i=0;i<10;i++)h.step({...idleInput(),pitch:-1,fire:true});
  (h as any).pencilActions.clear();
  const d=h.courtyard!.drawing!;assert.ok(d.ink.length);assert.ok(h.pencilAction(true));
  assert.equal(d.ink.length,0);assert.equal(d.pencils[0].owner,'host');assert.equal(d.pencils[0].tip,null);
 }finally{h.close();}
});

test('eraser is exclusive, clips contacted ink, preserves distant marks and releases on departure',()=>{
 const d=createDrawing(),a=artist('a',2);assert.ok(pencilAction(d,a));assert.equal(d.pencils[2].owner,'a');
 const other=artist('b',2);assert.equal(pencilAction(d,other),false);
 a.player.pos={x:81,y:1.7,z:10};a.input.fire=true;a.input.pitch=-Math.PI/2;
 d.ink=[[0,1280,2560,1792,2560],[1,0,0,128,0]];const sequence=d.sequence;
 stepDrawing(d,[a],6);
 assert.ok(d.sequence>sequence);assert.equal(d.ink.length,3,'middle is erased, two ends remain');
 assert.deepEqual(d.ink[2],[1,0,0,128,0]);assert.ok(validateDrawing(d));
 stepDrawing(d,[],10);assert.equal(d.pencils[2].owner,null);
});
test('wall clear works for a nearby guest but remote guests cannot clear or take distant tools',()=>{
 const h=new FriendsSession('host');try{
  h.enterPrelobby();const w=h.world!;w.addCrew('guest');const guest=w.crew.find(p=>p.id==='guest')!;
  h.courtyard!.drawing!.ink=[[0,0,0,20,20]];
  guest.player.pos={x:81,y:1.7,z:2};assert.equal((h as any).applyPencilAction('guest',true),false);
  assert.equal(h.courtyard!.drawing!.ink.length,1);
  (h as any).pencilActions.clear();guest.player.pos={...CLEAR_BUTTON,x:CLEAR_BUTTON.x-1};
  assert.ok((h as any).applyPencilAction('guest'));assert.equal(h.courtyard!.drawing!.ink.length,0);
 }finally{h.close();}
});
test('large boards use tiny acknowledged deltas; eraser replacements, clears and repair roundtrip',()=>{
 const h=new FriendsSession('host');try{
  h.enterPrelobby();const d=h.courtyard!.drawing!;
  d.ink=Array.from({length:MAX_INK-2},(_,i)=>[i%2,i%768,Math.floor(i/768),i%768,Math.floor(i/768)]);
  const first=h.snapshot()!,full=encodeState(first,1,0),received=decodeState(full,new Map())!;
  assert.ok(full.length<190000);const sender=snapshotBaseline(first),receiver=snapshotBaseline(received.snapshot);
  d.ink.splice(200,1,[0,100,100,110,110],[0,115,115,120,120]);d.ink.push([1,5,5,6,6]);d.sequence++;
  const delta=encodeState(h.snapshot()!,2,1,sender);assert.ok(delta.length<4000,'only edited ink is transmitted');
  assert.equal(decodeState(delta,new Map()),null,'missing baseline requests repair');
  const decoded=decodeState(delta,new Map([[1,receiver]]))!;
  assert.deepEqual(decoded.snapshot.courtyard!.drawing!.ink,d.ink);
  assert.equal(sender.drawing!.ink.length,MAX_INK-2,'baseline remains immutable');
  const base=snapshotBaseline(h.snapshot()!);d.ink=[];d.sequence++;
  const clear=decodeState(encodeState(h.snapshot()!,3,2,base),new Map([[2,snapshotBaseline(decoded.snapshot)]]))!;
  assert.deepEqual(clear.snapshot.courtyard!.drawing!.ink,[]);
 }finally{h.close();}
});

test('drawing network rejects malformed references, truncated rows and invalid tools',()=>{
 const h=new FriendsSession('host');try{
  h.enterPrelobby();const packed=packDrawing(h.courtyard!)!;
  for(const data of [
   {...packed.drawing!,ink:new Uint8Array([0])},
   {...packed.drawing!,relative:true,runs:[0,1]},
   {...packed.drawing!,runs:[-1,MAX_INK+1]},
   {...packed.drawing!,runs:[-2,1]},
   {...packed.drawing!,ink:new Uint8Array(11),runs:[-1,1],pencils:[]}
  ])assert.throws(()=>unpackDrawing({...packed,drawing:data}));
 }finally{h.close();}
});

test('clicking while looking down beside the wall cannot accidentally clear the field',()=>{
 const pos={x:CLEAR_BUTTON.x-1,y:1.7,z:CLEAR_BUTTON.z};
 assert.ok(aimingClearButton(pos,{yaw:-Math.PI/2,pitch:0}));
 assert.equal(aimingClearButton(pos,{yaw:-Math.PI/2,pitch:-1}),false);
 assert.equal(aimingClearButton({...pos,x:80},{yaw:-Math.PI/2,pitch:0}),false);
});

test('free draw reaches the whole field, styles survive snapshots, grid is optional',()=>{
 const h=new FriendsSession('host');try{
  h.enterPrelobby();h.world!.player.pos={...pencilDock(0),y:1.7};assert.ok(h.pencilAction());
  const d=h.courtyard!.drawing!;assert.equal(d.grid,false);
  assert.ok(h.drawingStyle({color:6,width:4,grid:true}));
  h.world!.player.pos={x:81,y:1.7,z:17};
  for(let i=0;i<10;i++)h.step({...idleInput(),pitch:-Math.atan2(1.7,25),fire:true});
  assert.ok(d.ink.length>0,'can draw over 25 metres away, not just at feet');
  assert.equal(d.ink[0][0],6);assert.equal(d.ink[0][5],4);
  assert.ok(validateDrawing(d));assert.equal(h.drawingStyle({width:999}),false);
  const decoded=decodeState(encodeState(h.snapshot()!,1,0),new Map())!;
  assert.deepEqual(structuredClone(decoded.snapshot.courtyard!.drawing),d);
 }finally{h.close();}
});
test('straight strokes coalesce without using up the drawing budget or losing curves',()=>{
 const d=createDrawing(),a=artist('a');pencilAction(d,a);a.player.pos.z=10;a.input.fire=true;
 for(let i=0;i<100;i++){a.player.pos.x=76+i*.01;stepDrawing(d,[a],i*2);}
 assert.ok(d.ink.length<=2,'one straight movement becomes one stroke, not 100 segments');
 a.input.yaw=.5;stepDrawing(d,[a],202);assert.ok(d.ink.length>=2,'a corner remains a corner');
});

test('fast aim sweeps remain continuous across the entire field',()=>{
 const d=createDrawing(),a=artist('a');pencilAction(d,a);a.player.pos={x:81,y:1.7,z:17};a.input.fire=true;
 a.input.pitch=-Math.atan2(1.7,24);a.input.yaw=-.2;stepDrawing(d,[a],2);
 const end=d.ink[0].slice(3,5);a.input.yaw=.2;stepDrawing(d,[a],4);
 assert.deepEqual(d.ink[1].slice(1,3),end,'a wide sweep draws a line instead of disconnected dots');
});
