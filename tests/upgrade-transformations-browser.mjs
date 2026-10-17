import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='artifacts/upgrade-transformations';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/upgrade-transformations-check',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:black}canvas{display:block}</style><canvas></canvas>'}));
 await page.goto('http://127.0.0.1:5173/upgrade-transformations-check');
 await page.evaluate(async()=>{
  const [{GameRenderer},{World,v},{constrainEnemyFloor}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-floor.ts')]);
  const renderer=new GameRenderer(document.querySelector('canvas'),{quality:'high',fov:90,mist:false});await renderer.prepare();
  const world=new World(41,{schedule:false,invulnerable:true});world.player.pos=v(0,1.7,0);
  for(const [i,kind] of ['squid','squid2','squid3'].entries()){
   const e=world.spawn(kind,v((i-1)*8,3,-16-i*3));e.age=10;constrainEnemyFloor(e,0);
  }
  const frame=(dt=0)=>renderer.render(world,0,.12,dt,false);
  const pixels=()=>{const gl=renderer.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  let captures=0;const copy=renderer.renderer.copyFramebufferToTexture.bind(renderer.renderer);
  renderer.renderer.copyFramebufferToTexture=(...args)=>{captures++;return copy(...args);};
  window.transforms={renderer,world,frame,pixels,get captures(){return captures;}};
 });
 const samples=[];
 for(const quality of ['low','high'])for(let level=2;level<=7;level++){
  await page.evaluate(({quality,level})=>{
   const {renderer,world,frame}=window.transforms;renderer.clear();renderer.configure({quality,fov:90,mist:false});world.level=level;frame();
  },{quality,level});
  const phases=[];
  for(const age of [0,.16,.36,.7,1.35]){
   const sample=await page.evaluate(({level,age})=>{
    const {renderer,frame,pixels}=window.transforms;
    renderer.upgradeScreenFlash.clear();frame();const baseline=pixels(),baselineCalls=renderer.renderer.info.render.calls;
    const copies=window.transforms.captures;renderer.upgradeScreenFlash.begin(level,age);frame();const effect=pixels();
    let changed=0,hash=2166136261,contrast=0;
    for(let i=0;i<effect.length;i+=4){const gain=Math.abs(effect[i]-baseline[i])+Math.abs(effect[i+1]-baseline[i+1])+Math.abs(effect[i+2]-baseline[i+2]);if(gain>12)changed++;if(i%128===0){hash=Math.imul(hash^effect[i],16777619);contrast+=gain;}}
    return {age,...renderer.upgradeScreenFlash.diagnostics,changed,hash:hash>>>0,contrast,extraCalls:renderer.renderer.info.render.calls-baselineCalls,copies:window.transforms.captures-copies};
   },{level,age});
   if(age<1.3){assert.ok(sample.changed>10000,`${quality} tier ${level} age ${age}: visible screen treatment`);assert.equal(sample.extraCalls,1);assert.equal(sample.copies,1);}
   else{assert.equal(sample.power,0);assert.equal(sample.changed,0,'expired effect restores the exact framebuffer');assert.equal(sample.extraCalls,0);assert.equal(sample.copies,0);}
   if(quality==='high'&&age<1)await page.screenshot({path:`${dir}/tier-${level}-${age.toFixed(2)}.png`});
   phases.push(sample);
  }
  assert.ok(new Set(phases.slice(0,4).map(p=>p.hash)).size===4,'effect evolves rather than holding a flat tint');
  samples.push({quality,level,phases});
 }
 assert.equal(new Set(samples.filter(s=>s.quality==='high').map(s=>s.phases[1].hash)).size,6,'all six treatments render distinctly');
 for(const [width,height] of [[390,844],[2200,900]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{const {renderer,frame}=window.transforms;renderer.resize();renderer.upgradeScreenFlash.begin(7,.2);frame();});
  await page.screenshot({path:`${dir}/eclipse-${width}.png`});
 }
 await page.evaluate(()=>{
  const {renderer,frame,pixels}=window.transforms;renderer.upgradeScreenFlash.begin(6,.25);frame();const before=pixels();frame(0);const after=pixels();
  if(!before.every((v,i)=>v===after[i]))throw Error('Paused effect kept moving');
  renderer.clear();frame();const copies=window.transforms.captures;frame();if(window.transforms.captures!==copies)throw Error('Idle screen still copied');
 });
 assert.deepEqual(errors,[]);await writeFile(`${dir}/audit.json`,JSON.stringify(samples,null,2));
 console.log('Six upgrade transformations passed: distinct evolving framebuffers, both qualities, exact fade-out, one copy/draw while active, no idle work, frozen pause, portrait and ultrawide.');
 await page.setViewportSize({width:1440,height:680});
 await page.route('**/upgrade-contact-sheet',r=>r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#0c090f;color:#ede4df;font:18px Arial;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}figure{margin:0;background:#19121c}img{width:100%;display:block}figcaption{padding:12px;letter-spacing:2px;font-size:14px}</style>${['KINDLED · EMBER VEINS','ASCENDANT · CRYSTAL FRACTURE','UNBOUND · CRIMSON TEARS','TWINFLAME · COLLIDING FIRE','DOMINION · BROKEN CROWN','ECLIPSE · IVORY CORONA'].map((name,i)=>`<figure><img src="/artifacts/upgrade-transformations/tier-${i+2}-0.16.png"><figcaption>${name}</figcaption></figure>`).join('')}`}));
 await page.goto('http://127.0.0.1:5173/upgrade-contact-sheet');await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 await page.screenshot({path:`${dir}/six-upgrades.png`});
}finally{await browser.close();}
