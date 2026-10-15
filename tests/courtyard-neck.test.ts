import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CourtyardNeck} from '../src/courtyard-neck';

test('level and upward views have no neck translation',()=>{
 const neck=new CourtyardNeck();
 for(const pitch of [1.5,.5,0,-.08])assert.deepEqual(neck.update(pitch,1),{forward:0,drop:0});
});
test('looking down smoothly leans forward and slightly lowers the eyes',()=>{
 const neck=new CourtyardNeck(),first={...neck.update(-1.5,1/60)};
 assert.ok(first.forward>0&&first.forward<.1);assert.ok(first.drop>=0&&first.drop<.01);
 for(let i=0;i<120;i++)neck.update(-1.5,1/60);
 assert.ok(neck.pose.forward>.35&&neck.pose.forward<.42);assert.ok(neck.pose.drop>.04&&neck.pose.drop<.07);
 const held={...neck.pose};neck.update(0,0);assert.deepEqual(neck.pose,held,'pause preserves the current view');
 neck.update(0,1/60);assert.ok(neck.pose.forward>0&&neck.pose.forward<held.forward,'return is eased');
 for(let i=0;i<180;i++)neck.update(0,1/60);assert.deepEqual(neck.pose,{forward:0,drop:0});
});
test('the response is consistent across frame rates and clears immediately on leaving the courtyard',()=>{
 const samples=[30,60,144].map(fps=>{const neck=new CourtyardNeck();for(let i=0;i<fps/2;i++)neck.update(-1.2,1/fps);return {...neck.pose};});
 for(const sample of samples)assert.ok(Math.abs(sample.forward-samples[0].forward)<1e-12&&Math.abs(sample.drop-samples[0].drop)<1e-12);
 const neck=new CourtyardNeck();neck.update(-1.5,1);neck.clear();assert.deepEqual(neck.pose,{forward:0,drop:0});
 for(const [pitch,dt]of [[NaN,.1],[-1,Infinity],[-1,-1]])assert.deepEqual(neck.update(pitch,dt),{forward:0,drop:0});
 neck.update(-100,100);assert.ok(neck.pose.forward<=.42&&neck.pose.drop<=.07);
});

test('wall limits stop the lean without pulling a stationary eye inward',async()=>{
 const {courtyardNeckFraction:limit}=await import('../src/courtyard-neck');
 const bounds={halfWidth:6.3,frontZ:-6.35,backZ:10.5},pose={forward:.4,drop:.06};
 assert.equal(limit({x:6.3,y:1.7,z:0},-Math.PI/2,pose,bounds),0);
 assert.equal(limit({x:6.3,y:1.7,z:0},Math.PI/2,pose,bounds),1,'leaning back into room stays available');
 assert.equal(limit({x:6.3,y:1.7,z:0},0,{forward:0,drop:0},bounds),1,'level view never snaps away from wall');
 const fraction=limit({x:6.2,y:1.7,z:0},-Math.PI/2,pose,bounds);assert.ok(Math.abs(fraction-.25)<1e-12);
});
test('neck lean respects climbing-block faces and permits looking over the top',async()=>{
 const {courtyardNeckFraction:limit}=await import('../src/courtyard-neck');
 const bounds={halfWidth:6.3,frontZ:-6.35,backZ:10.5},pose={forward:.4,drop:.06},blocks=[{x:4.9,z:2.5,w:2.3,d:2,h:1.8}];
 const fraction=limit({x:3.5,y:1.7,z:2.5},-Math.PI/2,pose,bounds,blocks);
 assert.ok(fraction>0&&fraction<1);assert.ok(3.5+.4*fraction<=3.69+1e-10,'eye keeps near-plane clearance from ledge');
 assert.equal(limit({x:3.5,y:2.5,z:2.5},-Math.PI/2,pose,bounds,blocks),1);
 assert.equal(limit({x:3.5,y:1.7,z:2.5},Math.PI/2,pose,bounds,blocks),1,'looking away from block stays available');
});
