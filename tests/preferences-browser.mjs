import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const directory=await mkdtemp(join(tmpdir(),'abyss-preferences-'));
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const errors=[];
let context;
async function open(){
 context=await chromium.launchPersistentContext(directory,{headless:true,viewport:{width:1440,height:900},...(existsSync(chrome)?{executablePath:chrome}:{})});
 const page=context.pages()[0];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 return page;
}
const preferences={sensitivity:'1.7',fov:'103',volume:'0',controllerSensitivity:'1.6',controllerDeadzone:'0.25'};
async function check(page,name){
 assert.equal(await page.locator('#player-name').textContent(),name);
 await page.click('#settings-open');
 for(const [id,value] of Object.entries(preferences))assert.equal(await page.locator('#'+id).inputValue(),value,id);
 assert.equal(await page.locator('#control-scheme').inputValue(),'azerty');
 assert.equal(await page.locator('#quality').inputValue(),'low');
 assert.equal(await page.locator('#threat-cues').isChecked(),true);
 await page.click('#settings-close');
 await page.click('#profile-edit');assert.equal(await page.locator('#profile-name').inputValue(),name);
 assert.equal(await page.locator('#profile-auto').isChecked(),false);await page.click('#profile-cancel');
}
try{
 let page=await open();await page.click('#settings-open');
 for(const id of ['sensitivity','fov','volume'])await page.locator('#'+id).fill(preferences[id]);
 await page.selectOption('#control-scheme','controller');
 for(const id of ['controllerSensitivity','controllerDeadzone'])await page.locator('#'+id).fill(preferences[id]);
 await page.selectOption('#control-scheme','azerty');await page.selectOption('#quality','low');await page.check('#threat-cues');await page.click('#settings-close');
 await page.click('#start');await page.locator('#profile-name').fill('Local nickname');await page.click('#profile-local');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('abyss-player-profile')).name),'Local nickname');
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#start').disabled);await check(page,'Local nickname');
 await context.close();page=await open();await check(page,'Local nickname');
 await page.click('#friends-open');await page.locator('#friends-name').fill('Crew nickname');await page.locator('#friends-name').press('Tab');
 await context.close();page=await open();await check(page,'Crew nickname');
 // Old builds saved only this name: it must not trigger setup again.
 await page.evaluate(()=>{localStorage.removeItem('abyss-player-profile');localStorage.setItem('abyss-player-name',JSON.stringify('Legacy nickname'));});
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 assert.equal(await page.locator('#player-name').textContent(),'Legacy nickname');await page.click('#start');
 assert.equal(await page.locator('#player-profile').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('Preferences passed: every option, local-only nickname, co-op nickname, reload, full browser restart, and legacy nickname restore.');
}finally{await context?.close();await rm(directory,{recursive:true,force:true});}
