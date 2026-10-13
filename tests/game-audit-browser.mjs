import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/audit-render-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto(url+'/audit-render-test');
 const result=await page.evaluate(async()=>{
  const {OriginalEnemies}=await import('/src/original-enemies.ts'),{World,v}=await import('/src/simulation.ts');
  const originals=new OriginalEnemies();await originals.loaded;if(!originals.ready)throw Error(originals.error);
  const w=new World(1,{schedule:false}),towers=[],skins=[];
  for(const kind of ['squid','squid2','squid3']){
   const e=w.spawn(kind,v(0,5,0)),model=originals.clone(kind),parts=[];
   model.traverse(o=>{if(/crest|jaw|teeth/.test(o.name))parts.push(o);});
   e.age=3;originals.animate(model,e,3);model.updateMatrixWorld(true);
   const opened=parts.map(p=>({name:p.name,position:p.position.y,matrix:p.matrix.elements[13],world:p.matrixWorld.elements[13]}));
   e.age=4.2;originals.animate(model,e,4.2);model.updateMatrixWorld(true);
   towers.push({kind,opened,closed:parts.map(p=>({name:p.name,position:p.position.y,matrix:p.matrix.elements[13],world:p.matrixWorld.elements[13]}))});
  }
  for(const kind of ['centipede','gigapede','ghostpede']){
   const model=originals.segment(true,kind),textures=[];
   model.traverse(o=>{if(o.isMesh&&o.material.map?.image?.src)textures.push(o.material.map.image.src.split('/').at(-1));});
   skins.push({kind,textures});
  }
  return {towers,skins};
 });
 for(const tower of result.towers){
  assert.ok(tower.opened.length>0);
  for(let i=0;i<tower.opened.length;i++){
   const open=tower.opened[i],closed=tower.closed[i];
   assert.notEqual(open.position,0,`${tower.kind} ${open.name} opens`);
   assert.equal(open.matrix,open.position);assert.notEqual(open.world,closed.world,'opening reaches world transform');
   assert.equal(Math.abs(closed.position),0);assert.equal(Math.abs(closed.matrix),0,'closing restores local matrix');
  }
 }
 for(const {kind,textures} of result.skins){
  const prefix=kind==='centipede'?'pede':kind==='gigapede'?'pedeblack':'ultrapede';
  for(let i=1;i<=3;i++)assert.ok(textures.includes(`${prefix}leg${i}.png`),`${kind} leg ${i} uses species material`);
  if(kind!=='centipede')assert.ok(!textures.some(t=>/^pedeleg/.test(t)));
 }
 assert.deepEqual(errors,[]);console.log('Game audit rendering regressions passed: all tower tiers open/close in world transforms; every pede uses its species leg textures.');
}finally{await browser.close();}
