import test from 'node:test';
import assert from 'node:assert/strict';
import {AscentRumble,ASCENT_RUMBLE} from '../src/ascent-rumble';

const length=(v:{x:number;y:number;z:number})=>Math.hypot(v.x,v.y,v.z);
test('propulsion loads the camera downward, rumbles during acceleration and settles',()=>{
 const rumble=new AscentRumble();rumble.configure(100);
 assert.ok(rumble.sample(482.08).y<-.04,'launch presses the camera downward');
 assert.ok(length(rumble.sample(486))>.005);
 for(const time of [0,30,144,472,480,494,498,504,510,519,750])assert.equal(length(rumble.sample(time)),0,`inactive at ${time}`);
 for(let t=480;t<495;t+=.001)assert.ok(length(rumble.sample(t))<=ASCENT_RUMBLE.maxOffset+1e-12);
});
test('shake intensity is linear, zero/reduced/suppressed are exact and changes do not restart the launch',()=>{
 const rumble=new AscentRumble();rumble.configure(100);const full={...rumble.sample(486.23)};
 rumble.configure(35);const scaled=rumble.sample(486.23);
 for(const key of ['x','y','z'] as const)assert.ok(Math.abs(scaled[key]-full[key]*.35)<1e-12);
 rumble.configure(0);assert.equal(length(rumble.sample(486.23)),0);
 rumble.configure(100,true);assert.equal(length(rumble.sample(486.23)),0);
 rumble.configure(100);assert.equal(length(rumble.sample(486.23,false)),0);
 assert.deepEqual(rumble.sample(486.23),full);
 rumble.clear();assert.equal(length(rumble.offset),0);
});
test('paused sampling, backward seeks and repeated cycles reproduce identical vibration',()=>{
 const rumble=new AscentRumble();rumble.configure(75);const first={...rumble.sample(486.125)};
 for(let frame=0;frame<144;frame++)assert.deepEqual(rumble.sample(486.125),first);
 rumble.sample(493);assert.deepEqual(rumble.sample(486.125),first);
 assert.deepEqual(rumble.sample(996.125),first);
 for(const fps of [30,60,144]){for(let frame=0;frame<fps;frame++)rumble.sample(485+frame/fps);assert.deepEqual(rumble.sample(486.125),first);}
});

test('default launch shake delivers a heavy slam and substantial sustained displacement',()=>{
 const rumble=new AscentRumble();rumble.configure(35);
 assert.ok(rumble.sample(482.08).y<-.12,'launch slam exceeds twelve centimetres at the default setting');
 let energy=0,peak=0,count=0;
 for(let t=484;t<490;t+=1/120){const strength=length(rumble.sample(t));energy+=strength*strength;peak=Math.max(peak,strength);count++;}
 assert.ok(Math.sqrt(energy/count)>.045,'sustained rumble stays forceful');
 assert.ok(peak>.08&&peak<=ASCENT_RUMBLE.maxOffset*.35,'strong but bounded at default intensity');
});
