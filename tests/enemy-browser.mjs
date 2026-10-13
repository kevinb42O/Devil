import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});const local='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';const executablePath=process.env.CHROME_PATH||(existsSync(local)?local:undefined);const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
try{
 for(const kind of ['squid','squid2','squid3','spider','spider2','skull','skull2','skull3','skull4','transmuted1','transmuted2','transmuted3','transmuted4','egg','egg2','spiderling','centipede','gigapede','ghostpede','leviathan','orb','thorn']){
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=new Set();page.on('pageerror',e=>errors.add(e.message));page.on('console',m=>{if(m.type()==='error')errors.add(m.text())});page.on('response',r=>{if(r.status()>=400)errors.add(`${r.status()} ${r.url()}`)});
  await page.goto(`http://127.0.0.1:5173/?enemy-preview=${kind}`);await page.waitForFunction(()=>window.abyss?.originalEnemies&&window.abyss.originalAssets,{},{timeout:30000});await page.click('#start');await page.waitForTimeout(400);await page.screenshot({path:`artifacts/original-enemy-${kind}.png`});assert.deepEqual([...errors],[],kind+' asset loading and shaders');console.log(kind+': original mesh/texture rendering passed');await page.close();
 }
}finally{await browser.close();}
