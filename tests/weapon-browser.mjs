import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const executablePath=process.env.CHROME_PATH||(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
for(let level=1;level<=4;level++){
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=new Set();page.on('pageerror',e=>errors.add(e.message));page.on('console',m=>{if(m.type()==='error')errors.add(m.text())});page.on('response',r=>{if(r.status()>=400)errors.add(`${r.status()} ${r.url()}`)});
 await page.goto('http://127.0.0.1:5173/?hand-preview='+level);await page.waitForFunction(()=>window.abyss?.originalAssets,{},{timeout:30000});await page.click('#start');await page.waitForTimeout(300);await page.screenshot({path:`artifacts/original-hand-${level}.png`});
 await page.mouse.down();await page.waitForTimeout(600);await page.screenshot({path:`artifacts/original-fire-${level}.png`});await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.abyss.handLevel),level);console.log('LEVEL',level,'ERRORS', [...errors]);assert.equal(errors.size,0);await page.close();
}
await browser.close();
