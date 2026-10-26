import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/environment-combat-audit',r=>r.fulfill({contentType:'text/html',body:'Environment combat mix audit'}));
 await page.goto(base+'/environment-combat-audit');
 await page.evaluate(async()=>{
  const [{Sound},{World}]=await Promise.all([import('/src/audio.ts'),import('/src/simulation.ts')]);
  // Capture the real final output, including the shared limiter.
  const create=AudioContext.prototype.createDynamicsCompressor;
  AudioContext.prototype.createDynamicsCompressor=function(){
   const limiter=create.call(this);window.finalMeter=this.createAnalyser();
   finalMeter.fftSize=4096;limiter.connect(finalMeter);return limiter;
  };
  window.sound=new Sound();await sound.start();
  await Promise.all([1,2,3,4].map(tier=>sound.load('rapid'+tier)));
  window.world=new World(1,{schedule:false,invulnerable:true});world.startAt(80);
  world.level=2;world.weaponAudioFor=()=>({primary:true,homing:false});
  sound.listener(world.player.pos,0,0);
  window.environmentMeter=sound.context.createAnalyser();environmentMeter.fftSize=4096;sound.environmentGain.connect(environmentMeter);
  window.effectsMeter=sound.context.createAnalyser();effectsMeter.fftSize=4096;sound.originalBus.connect(effectsMeter);
  window.timer=setInterval(()=>{sound.update(world);sound.updateEnvironment(world.time,.02);},20);
  window.measure=async()=>{
   const data=new Float32Array(4096);let environment=0,effects=0,peak=0;
   for(let i=0;i<40;i++){
    environmentMeter.getFloatTimeDomainData(data);environment+=data.reduce((sum,x)=>sum+x*x,0)/data.length;
    effectsMeter.getFloatTimeDomainData(data);effects+=data.reduce((sum,x)=>sum+x*x,0)/data.length;
    finalMeter.getFloatTimeDomainData(data);for(const x of data)peak=Math.max(peak,Math.abs(x));
    await new Promise(r=>setTimeout(r,20));
   }
   return {environmentRms:Math.sqrt(environment/40),effectsRms:Math.sqrt(effects/40),relativeDb:10*Math.log10(environment/effects),peak};
  };
 });
 const report=[];
 // Tier 2 has the loudest sustained original weapon body. Each bed must remain
 // measurable beside it; the old rain mix fails the -24 dB audibility floor.
 for(const [name,time] of [['space',0],['ash',35],['storm',80],['veil',150],['furnace',270],['cathedral',390],['depth',480],['heaven',504]]){
  await page.evaluate(time=>world.time=time,time);
  await page.waitForFunction(name=>sound.diagnostics.environment.beds.some(b=>b.name===name&&b.streams.some(s=>s.playing&&s.ready>=3&&s.gain>.05)),name);
  await page.waitForTimeout(600);
  const output=await page.evaluate(()=>measure());
  assert.ok(output.relativeDb>-24,`${name} must remain audible under native fire: ${output.relativeDb} dB`);
  assert.ok(output.relativeDb<-3,`${name} must leave weapons in the foreground: ${output.relativeDb} dB`);
  assert.ok(output.peak<.65,`${name} retains final mix headroom`);
  report.push({name,tier:2,...output});
 }
 for(const tier of [1,3,4]){
  await page.evaluate(tier=>{world.time=80;world.level=tier;},tier);await page.waitForTimeout(700);
  const output=await page.evaluate(()=>measure());
  assert.ok(output.relativeDb>-24,`rain remains audible under hand ${tier}`);
  assert.ok(output.peak<.65,'native fire and rain retain headroom');
  report.push({name:'storm',tier,...output});
 }
 await page.evaluate(()=>{clearInterval(timer);sound.clear();});
 assert.deepEqual(await page.evaluate(()=>sound.diagnostics.environment.failed),[]);
 assert.deepEqual(errors,[]);
 mkdirSync('artifacts/environment-audio',{recursive:true});
 writeFileSync('artifacts/environment-audio/combat-mix-report.json',JSON.stringify(report,null,2)+'\n');
 console.log('All eight soundscapes remain audible beside native fire; rain passes across all four original hands with final mix headroom.');
}finally{await browser.close();}
