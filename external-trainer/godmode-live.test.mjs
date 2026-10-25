import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {attachMemory} from './memory-bridge.mjs';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const page=await browser.newPage();
  await page.goto(process.env.GAME_URL||'https://devilsdescent.vercel.app',{waitUntil:'domcontentloaded',timeout:60000});
  await attachMemory(page);
  await page.locator('#start').click();
  if(await page.locator('#player-profile').isVisible())await page.locator('#profile-local').click();
  await page.waitForFunction(()=>!!window.__abyssTrainerAccess.get().world);
  // Present combat state while retaining the deployed World object. Starting
  // normally opens the sanctuary; this fixture avoids advancing a ranked run.
  await page.evaluate(()=>{
    const access=window.__abyssTrainerAccess,get=access.get;
    access.get=()=>({...get(),mode:'playing',entrance:false,courtyard:null,spectating:false});
  });
  await attachMemory(page);
  const result=await page.evaluate(()=>{
    const access=window.__abyssTrainerAccess,aim=window.__abyssMemoryAim,world=access.get().world;
    // Exercise the installed adapter against the deployed world's real death handler.
    // No gameplay step or score submission is needed.
    const original=world.die;
    aim.control({enabled:false,godmode:true,suspended:true});
    const active=aim.snapshot().godmode.active;
    world.die('CONTACT');const collision=world.state==='playing';
    world.player.pos={x:100,y:-9,z:0};world.player.vel.y=-30;
    world.die('FALLEN');const fall=world.state==='playing'&&world.player.pos.y>-8&&world.player.vel.y===0;
    aim.control({enabled:false,godmode:false});const restored=world.die===original;
    aim.stop();
    return {active,collision,fall,restored};
  });
  assert.deepEqual(result,{active:true,collision:true,fall:true,restored:true});
  console.log('PASS deployed Mac godmode:',JSON.stringify(result));
} finally {await browser.close();}
