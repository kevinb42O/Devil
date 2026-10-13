// Start Vite, then run: GAME_URL=http://127.0.0.1:5173 node artifacts/game-audit/render-reproduce.mjs
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try {
  const page=await browser.newPage(), url=process.env.GAME_URL||'http://127.0.0.1:5173';
  await page.route(url+'/audit-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Audit fixture</body></html>'}));
  await page.goto(url+'/audit-fixture');
  const result=await page.evaluate(async()=>{
    const {OriginalEnemies}=await import('/src/original-enemies.ts');
    const {World,v}=await import('/src/simulation.ts');
    const original=new OriginalEnemies(); await original.loaded;
    const w=new World(1,{schedule:false}), e=w.spawn('squid',v(0,3.3,0)); e.age=3;
    const model=original.clone('squid'), crest=model.getObjectByName('minisquidcrest');
    model.updateMatrixWorld(true); const before=crest.matrixWorld.elements[13];
    original.animate(model,e,3); model.updateMatrixWorld(true);
    const skins=[];
    for(const kind of ['gigapede','ghostpede']) {
      const segment=original.segment(true,kind), textures=[];
      segment.traverse(o=>{if(o.isMesh&&o.material.map?.image?.src) textures.push(o.material.map.image.src.split('/').at(-1));});
      skins.push({kind,textures});
    }
    return {tower:{before,propertyY:crest.position.y,matrixY:crest.matrix.elements[13],worldY:crest.matrixWorld.elements[13]},skins};
  });
  assert.equal(result.tower.propertyY,.4); assert.equal(result.tower.matrixY,.4);
  assert.notEqual(result.tower.before,result.tower.worldY);
  for(const skin of result.skins) {const prefix=skin.kind==='gigapede'?'pedeblack':'ultrapede';for(let i=1;i<=3;i++)assert.ok(skin.textures.includes(`${prefix}leg${i}.png`));}
  console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
