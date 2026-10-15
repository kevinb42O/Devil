import test from 'node:test';
import assert from 'node:assert/strict';
import {courtyardEmotes,keyboardMovement,controllerState} from '../src/controls';
import {World,idleInput} from '../src/simulation';
import {FriendsSession,applySnapshot} from '../src/multiplayer';
import {inputRuns} from '../src/network-input';
import {encodePacket} from '../src/network-codec';
import {encodeState,decodeState,StateAssembler} from '../src/network-state';
import {SnapshotTimeline} from '../src/network-presentation';

test('layout letters raise each arm independently without replacing movement',()=>{
 for(const [scheme,left,movement]of [['qwerty','q','a'],['azerty','a','q']] as const){
  assert.deepEqual(courtyardEmotes(new Set([left]),scheme),{leftArm:true,rightArm:false});
  assert.deepEqual(courtyardEmotes(new Set(['e']),scheme),{leftArm:false,rightArm:true});
  const keys=new Set([left,'e',movement]);assert.deepEqual(courtyardEmotes(keys,scheme),{leftArm:true,rightArm:true});assert.equal(keyboardMovement(keys,scheme).strafe,-1);
  assert.deepEqual(courtyardEmotes(new Set([movement]),scheme),{leftArm:false,rightArm:false});
 }
 const pad={axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};pad.buttons[6].value=.8;pad.buttons[7].pressed=true;
 const state=controllerState(pad as any,.15);assert.deepEqual(courtyardEmotes(new Set(),'controller',state.homing,state.fire),{leftArm:true,rightArm:true});
 assert.deepEqual(courtyardEmotes(new Set(['a','q','e']),'mobile'),{leftArm:false,rightArm:false});
});

test('guest holds and release survive commands, binary snapshots and interpolated courtyard views',()=>{
 const host=new FriendsSession('host');try{
  host.links.set('guest',{pc:{close(){}},state:{readyState:'open',bufferedAmount:0,send(){}},timer:0,events:[],baselines:new Map(),ackFrame:0,sentEpoch:-1,tokens:262144,tokenAt:performance.now(),lastSend:0,sendInterval:50,assembler:new StateAssembler()} as any);
  host.members.push({id:'guest',name:'Guest',host:false,ready:true});host.setReady(true);host.enterPrelobby();
  const commands=[{seq:1,input:{...idleInput(),leftArm:true}},{seq:2,input:{...idleInput(),leftArm:true,rightArm:true}},{seq:3,input:idleInput()}];
  const packet=encodePacket({epoch:host.epoch,life:0,runs:inputRuns(commands)});(host as any).receiveCommands('guest',packet.buffer);
  host.step({...idleInput(),rightArm:true});assert.equal(host.world!.crew[1].input.leftArm,true);
  host.step({...idleInput(),rightArm:true});
  const snapshot=decodeState(encodeState(host.snapshot()!,1,0),new Map())!.snapshot;
  assert.equal(snapshot.crew[0].rightArm,true);assert.equal(snapshot.crew[1].leftArm,true);assert.equal(snapshot.crew[1].rightArm,true);
  const view=new World(1);applySnapshot(view,snapshot,'host');const timeline=new SnapshotTimeline();timeline.push(snapshot,100);const sample=timeline.view(view,'host',100,{x:0,y:0,z:0});assert.equal(sample.crew[1].input.rightArm,true);
  host.step(idleInput());assert.equal(host.world!.crew[1].input.leftArm,undefined);assert.equal(host.world!.stats.shots,0);
  const held={...idleInput(),leftArm:true,rightArm:true};host.world!.predictCrew('guest',held,undefined,true);assert.equal(host.world!.crew[1].input.leftArm,true);
  for(const member of host.members){member.ready=true;member.loaded=host.epoch;}
  const courtyard=host.world!.courtyard!;courtyard.phase='collecting';courtyard.participants=host.members.map(member=>member.id);courtyard.committed=[...courtyard.participants];
  host.start(true);assert.equal(host.running,true);host.startAt=0;host.step(held);assert.equal(host.world!.crew[0].input.leftArm,undefined);assert.equal(host.snapshot()!.crew[0].leftArm,undefined);
  host.world!.predictCrew('guest',held);assert.equal(host.world!.crew[1].input.rightArm,undefined);
 }finally{host.close();}
});
