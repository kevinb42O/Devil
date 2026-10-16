import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrawing,pencilDock,pencilAction,stepDrawing,validateDrawing,MAX_INK,DRAWING_BOARD} from '../src/courtyard-drawing';
import {courtyardCanOccupy} from '../src/courtyard-state';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {encodeState,decodeState} from '../src/network-state';
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
 assert.deepEqual(d.pencils.map(p=>p.owner),['a','b']);
 assert.equal(pencilAction(d,a),true);assert.equal(d.pencils[0].owner,null);
 stepDrawing(d,[],5);assert.ok(d.pencils.every(p=>!p.owner));
 assert.equal(pencilAction(d,artist('far')),true);
 const far=artist('remote');far.player.pos.x=0;assert.equal(pencilAction(d,far),false);
});
test('freehand ink follows floor aim, separates strokes and stays bounded and validated',()=>{
 const d=createDrawing(),a=artist('a');pencilAction(d,a);a.player.pos.z=10;a.input.fire=true;
 stepDrawing(d,[a],5);assert.equal(d.ink.length,1);
 a.input.yaw=.2;stepDrawing(d,[a],10);assert.equal(d.ink.length,2);assert.deepEqual(d.ink[1].slice(1,3),d.ink[0].slice(3));
 a.input.fire=false;stepDrawing(d,[a],11);a.input.fire=true;a.input.yaw=-.2;stepDrawing(d,[a],15);
 assert.deepEqual(d.ink[2].slice(1,3),d.ink[2].slice(3),'new stroke has no connecting line');
 a.input.pitch=.2;stepDrawing(d,[a],20);assert.equal(d.ink.length,3,'looking above floor never writes');
 for(let i=0;i<1000;i++){a.input.pitch=-1;a.input.yaw=i%2?.3:-.3;stepDrawing(d,[a],25+i*5);}
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
  assert.ok(encodeState(h.snapshot()!,2,0).length<16000,'even a full board fits the snapshot budget');
  h.returnToLobby();assert.equal(h.courtyard!.drawing!.ink.length,0);assert.ok(h.courtyard!.drawing!.pencils.every(p=>!p.owner));
 }finally{h.close();}
});
