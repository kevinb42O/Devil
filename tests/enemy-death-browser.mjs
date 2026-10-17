import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 await mkdir('artifacts/enemy-death',{recursive:true});
 const results=[];
 for(const kind of ['spider','spider2','spiderling','centipede','gigapede','ghostpede','leviathan']){
  const result=await page.evaluate(async kind=>{
   const [{World,v},{GameRenderer}]=await Promise.all([import('/src/simulation.ts'),import('/src/renderer.ts')]);
   if(!window.deathRenderer){const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(canvas);window.deathRenderer=new GameRenderer(canvas,{quality:'high',fov:75,mist:false});await window.deathRenderer.prepare();}
   const renderer=window.deathRenderer;renderer.clear();const world=new World(71,{schedule:false,invulnerable:true});world.time=20;world.player.pos=v(0,9,17);
   const e=world.spawn(kind,v(0,kind==='spider2'?8.9:kind==='spider'?4.45:kind==='spiderling'?.55:8,-8),false);e.pos=v(0,kind==='spider2'?8.9:kind==='spider'?4.45:kind==='spiderling'?.55:8,-8);e.age=20;e.headExposure=1;e.facingYaw=0;
   e.segments.forEach((s,i)=>{s.pos=v((i%4-1.5)*3,8,-10-Math.floor(i/4)*3);});
   const draw=()=>renderer.render(world,0,-.22,1/60,false);draw();
   const liveModel=renderer.enemies.get(e.id),template=renderer.originalEnemies.templates.get(kind);const templateScale=template.scale.clone();
   world.damageEnemy(e,e.hp+1);for(const effect of world.effects)renderer.effect(effect,world,0,0);world.effects=[];world.enemies=[];draw();
   const corpses=renderer.creatureDeaths.corpses,corpse=corpses.get(e.id);if(!corpse)throw Error('No corpse for '+kind);
   const first=corpse.parts.map(p=>p.node.position.clone());world.time+=.55;draw();
   const moved=corpse.parts.some((p,i)=>p.node.position.distanceTo(first[i])>.05),visible=corpse.model.visible;
   const batched=kind.includes('pede')?Array.from(renderer.segmentBatches.batches.values()).reduce((n,b)=>n+b.mesh.count,0):0;
   const crystals=[];corpse.model.traverse(n=>{if(n.name.includes('weak-point')||n.name==='spider-held-gem')crystals.push(n.visible);});
   window.deathFixture={renderer,world,draw,corpse,id:e.id};
   return {kind,moved,visible,batched,crystals,retained:!liveModel||corpse.model===liveModel,templateUnchanged:template.scale.equals(templateScale)};
  },kind);
  await page.screenshot({path:`artifacts/enemy-death/${kind}.png`});
  const cleanup=await page.evaluate(()=>{const {renderer,world,draw,corpse,id}=window.deathFixture;world.time+=3;draw();const expired=!renderer.creatureDeaths.corpses.has(id)&&!corpse.model.parent;renderer.clear();return {expired,cleared:renderer.creatureDeaths.corpses.size===0&&renderer.lastSpiderlings.size===0};});
  assert.ok(result.moved&&result.visible&&result.retained&&result.templateUnchanged,JSON.stringify(result));assert.ok(result.crystals.every(v=>!v),'dead crystals stay hidden');
  if(['centipede','gigapede','ghostpede'].includes(kind))assert.ok(result.batched>0,'dead spine must still render through segment batches');
  assert.ok(cleanup.expired&&cleanup.cleared,JSON.stringify(cleanup));results.push({...result,...cleanup});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
