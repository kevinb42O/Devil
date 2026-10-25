import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {attachMemory} from './memory-bridge.mjs';
import {createSurvivalAssist} from './survival.mjs';
import {createMemoryAim} from './targeting.mjs';
import {arenaData} from './arena-data.mjs';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();
 await page.goto(process.env.GAME_URL||'https://devilsdescent.vercel.app',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>!!window.__abyssTrainerAccess,null,{timeout:60000});
 await attachMemory(page);
 await page.locator('#start').click();
 if(await page.locator('#player-profile').isVisible())await page.locator('#profile-local').click();
 await page.waitForFunction(()=>!!window.__abyssTrainerAccess.get().world);
 const result=await page.evaluate(({survivalFactory,aimFactory,arena})=>{
   const game=window.__abyssTrainerAccess;
   const live=window.__abyssMemoryAim.control({enabled:true});
   if(!live.survival?.available)throw Error('Deployed game movement hook is unavailable');
   const World=game.get().world.constructor;
   const checks=[];
   for(const mode of ['dodge','edge','emergency']){
     const world=new World(123,{schedule:false});world.player.pos={x:0,y:1.7,z:0};
     const state={world,mode:'playing',focused:true,yaw:0,pitch:0,fire:false};
     const env={performance:{now:()=>world.time*1000}};
     const access={get:()=>state,set:(yaw,pitch)=>{state.yaw=yaw;state.pitch=pitch;}};
     access.survival=(0,eval)('('+survivalFactory+')')(access,arena,env);
     const aim=(0,eval)('('+aimFactory+')')(access,env);
     const input={forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false};
     let active=false;
     if(mode==='dodge'){const e=world.spawn('thorn',{x:0,y:0,z:-4});e.age=12;input.forward=1;}
     if(mode==='edge'){
       world.time=600;let edge=0;
       for(let x=0;x<35;x+=.1)if(access.survival.floor(x,0,600)>-1)edge=x;
       world.player.pos={x:edge-1.8,y:access.survival.floor(edge-1.8,0,600)+1.7,z:0};
       world.player.vel={x:8,y:0,z:0};input.strafe=1;
     }
     if(mode==='emergency'){
       const tower=world.spawn('squid',{x:0,y:3.3,z:-15});tower.age=12;
       const skull=world.spawn('skull',{x:3,y:1,z:0});skull.age=12;skull.vel={x:-10,y:0,z:0};
       aim.control({enabled:true,emergency_targeting:true});
       if(aim.step().target?.enemy!==skull.id)throw Error('Deployed emergency targeting failed');
       checks.push({mode,passed:true});aim.stop();continue;
     }
     for(let i=0;i<180&&world.state==='playing';i++){
       aim.control({enabled:true});world.step(input,1/120);active||=access.survival.snapshot().active;
     }
     if(!active||world.state!=='playing')throw Error('Deployed '+mode+' assist failed: '+world.cause);
     aim.stop();checks.push({mode,passed:true});
   }
   return {movementHookAvailable:live.survival.available,checks};
 },{survivalFactory:createSurvivalAssist.toString(),aimFactory:createMemoryAim.toString(),arena:arenaData});
 assert(result.checks.every(c=>c.passed));console.log('PASS deployed game:',JSON.stringify(result));
} finally {await browser.close();}
