import {World,idleInput} from '../src/simulation';
import {FriendsSession} from '../src/multiplayer';
import {encodeState} from '../src/network-state';
import {writeFileSync,mkdirSync} from 'node:fs';
/** Matched six-player simulation probe. Does not claim GPU/mobile performance. */
const results=[];
for(const level of [4,5,6,7]){
 const w=new World(71,{schedule:false,invulnerable:true});for(let i=0;i<6;i++){w.addCrew('p'+i);w.crew[i].level=level;w.crew[i].reserve=800;}
 const inputs=new Map(w.crew.map((p,i)=>[p.id,{...idleInput(),yaw:i*Math.PI/3,fire:true}]));const samples:number[]=[],cpuSamples:number[]=[];
 for(let i=0;i<360;i++){w.effects=[];const at=performance.now(),cpu=process.cpuUsage();w.stepCrew(inputs);const used=process.cpuUsage(cpu);if(i>=240){samples.push(performance.now()-at);cpuSamples.push((used.user+used.system)/1000);}}
 samples.sort((a,b)=>a-b);cpuSamples.sort((a,b)=>a-b);const session=new FriendsSession('host');try{session.world=w;session.running=true;const snapshot=session.snapshot()!,at=performance.now(),bytes=encodeState(snapshot,1,0).byteLength;
 results.push({level,crew:6,simulatedSeconds:w.time,projectiles:w.projectiles.length,shots:w.stats.shots,p95CpuTickMs:cpuSamples[Math.floor(cpuSamples.length*.95)],p50TickMs:samples[Math.floor(samples.length*.5)],p95TickMs:samples[Math.floor(samples.length*.95)],maxTickMs:samples.at(-1),encodedBytes:bytes,encodeMs:performance.now()-at});}finally{session.close();}
}
mkdirSync('artifacts/twin-ascension',{recursive:true});writeFileSync('artifacts/twin-ascension/simulation-profile.json',JSON.stringify({note:'Local CPU-only probe; concurrent machine load affects timing. No GPU or mobile claim.',results},null,2)+'\n');console.log(JSON.stringify(results));
