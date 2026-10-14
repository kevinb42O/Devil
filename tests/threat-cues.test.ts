import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,v} from '../src/simulation.ts';
import {nearbyThreats} from '../src/threat-cues.ts';

test('nearby cues follow camera yaw with front/right/rear/left bearings',()=>{
 const w=new World(1,{schedule:false});w.player.pos=v();
 for(const pos of [v(0,0,-4),v(4,0,0),v(0,0,4),v(-4,0,0)]){const e=w.spawn('skull',pos);e.pos=pos;e.age=2;}
 for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI,7*Math.PI]){
  const cues=nearbyThreats(w,yaw);assert.equal(cues.length,4);
  for(let i=0;i<4;i++){
   assert.ok(Math.abs(Math.sin(cues[i].angle)-Math.sin(i*Math.PI/2+yaw))<1e-10);
   assert.ok(Math.abs(Math.cos(cues[i].angle)-Math.cos(i*Math.PI/2+yaw))<1e-10);
  }
 }
});

test('cues include newly active enemies but exclude dormant, dead and distant enemies',()=>{
 const w=new World(1,{schedule:false});w.player.pos=v();
 const live=w.spawn('skull',v(0,0,-3));live.age=.7;live.pos=v(0,0,-3);
 const dormant=w.spawn('skull',v(0,0,-2));dormant.activeAt=3;dormant.age=2;
 const dead=w.spawn('skull',v(0,0,-1));dead.hp=0;
 w.spawn('skull',v(0,0,-10));
 assert.deepEqual(nearbyThreats(w,0).map(c=>c.id),[live.id]);
});

test('pede cues point to the closest body segment even with the head out of range',()=>{
 const w=new World(1,{schedule:false});w.player.pos=v(0,2,0);
 for(const kind of ['centipede','gigapede'] as const){
  const e=w.spawn(kind,v(20,2,0));e.age=20;e.activeAt=0;e.status='hunting';
  e.centipedeMotion=undefined;
  e.segments=[{pos:v(-3,2,0),hp:0},{pos:v(15,2,0),hp:1}];
 }
 const cues=nearbyThreats(w,0);assert.equal(cues.length,2);
 for(const cue of cues){assert.equal(cue.distance,3);assert.equal(cue.angle,-Math.PI/2);}
});

test('only the five closest threats are shown',()=>{
 const w=new World(1,{schedule:false});w.player.pos=v();
 for(const range of [8,7,6,5,4,3,2]){const e=w.spawn('skull',v(0,0,-range));e.pos=v(0,0,-range);e.age=2;}
 assert.deepEqual(nearbyThreats(w,0).map(c=>c.distance),[2,3,4,5,6]);
});
