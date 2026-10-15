import { chromium } from '@playwright/test';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createMemoryAim, resolveDamagePoint } from './targeting.mjs';
import {desktopTelemetry} from './geometry.mjs';

export async function attachMemory(page) {
  await page.waitForFunction(()=>Object.getOwnPropertyDescriptor(window,'abyss')?.get, null, {timeout:60000});
  await page.evaluate(async()=>{
    const collision=await import('/src/projectile-collision.ts');
    const simulation=await import('/src/simulation.ts');
    const presentation=await import('/src/enemy-presentation.ts');
    const kinds=await import('/src/enemy-kinds.ts');
    window.__abyssMemoryHelpers={sweepArmor:collision.sweepArmor,armorBounds:collision.armorBounds,segmentSphere:simulation.segmentSphere,
      emergence:presentation.enemyEmergenceScale,spiderRadius:presentation.SPIDER_CRYSTAL_RADIUS,stats:kinds.ENEMY_STATS};
  });
  const session=await page.context().newCDPSession(page);
  await session.send('Debugger.enable');
  const result=await session.send('Runtime.evaluate',{expression:'Object.getOwnPropertyDescriptor(window,"abyss").get'});
  const breakpoint=await session.send('Debugger.setBreakpointOnFunctionCall',{objectId:result.result.objectId});
  let timeout;
  const paused=new Promise((resolve,reject)=>{
    timeout=setTimeout(()=>reject(Error('Could not inspect game module scope')),10000);
    session.once('Debugger.paused',resolve);
  });
  const triggered=session.send('Runtime.evaluate',{expression:'void window.abyss'});
  try {
    const event=await paused;clearTimeout(timeout);
    const expression=`(()=>{
      globalThis.__abyssMemoryAim?.stop();
      const access={
        get:()=>({world,mode,entrance,courtyard:world?.courtyard,spectating:!!spectator.position,yaw,pitch,cameraFov:renderer.camera.fov,fire:sampledFire||input.fire,homing:sampledHoming||input.homing,canHoming:!!world?.homingUnlocked&&world.reserve>0,armorEnemies:world?.enemies.filter(e=>globalThis.__abyssMemoryHelpers.armorBounds(e)!==null),focused:document.hasFocus()&&!controlMenuRoot()&&(settings.controlScheme==='controller'||settings.controlScheme==='mobile'||!!document.pointerLockElement)}),
        set:(y,p)=>{yaw=y;pitch=p;input.yaw=y;input.pitch=p;},
        maxHealth:(enemy,index)=>{
          const spec=globalThis.__abyssMemoryHelpers.stats[enemy.kind];
          return index.startsWith('crystal')?spec.hp/enemy.weakpoints.length:index.startsWith('segment')?spec.hp/spec.gems:spec.hp;
        },
        radius:(enemy,index,base)=>{
          const helpers=globalThis.__abyssMemoryHelpers;
          if(index.startsWith('segment'))return base;
          if(enemy.kind==='spider'||enemy.kind==='spider2')return helpers.spiderRadius*enemy.size*helpers.emergence(enemy);
          return index.startsWith('crystal')?base*helpers.emergence(enemy):base;
        },
        resolve:(enemy,pos,radius,state,homing,trajectory)=>(${resolveDamagePoint.toString()})(enemy,pos,radius,state,homing,globalThis.__abyssMemoryHelpers,trajectory),
        project:(pos,radius)=>{
          const rect=document.querySelector('#game').getBoundingClientRect();
          if(rect.width<1||rect.height<1)return {box:null};
          const vector=renderer.camera.position.clone().set(pos.x,pos.y,pos.z).project(renderer.camera);
          if(!Number.isFinite(vector.x+vector.y+vector.z))return {box:null};
          if(vector.z< -1||vector.z>1||Math.abs(vector.x)>1||Math.abs(vector.y)>1){
            const cameraPoint=renderer.camera.position.clone().set(pos.x,pos.y,pos.z).applyMatrix4(renderer.camera.matrixWorldInverse);
            let dx=cameraPoint.x,dy=-cameraPoint.y;if(Math.hypot(dx,dy)<.001)dx=1;
            const scale=Math.min(Math.max(1,rect.width/2-26)/Math.max(.001,Math.abs(dx)),Math.max(1,rect.height/2-26)/Math.max(.001,Math.abs(dy)));
            return {box:null,arrow:{x:rect.width/2+dx*scale,y:rect.height/2+dy*scale,angle:Math.atan2(dy,dx)}};
          }
          const x=(vector.x+1)*rect.width/2,y=(1-vector.y)*rect.height/2;
          const distance=renderer.camera.position.distanceTo(pos);
          const r=Math.max(5,Math.min(100,radius*rect.height/(2*Math.tan(renderer.camera.fov*Math.PI/360)*Math.max(distance,.001))));
          return {x,y,box:[x-r,y-r,r*2,r*2]};
        }
      };
      globalThis.__abyssMemoryAim=(${createMemoryAim.toString()})(access);
      globalThis.__abyssMemoryGetter=Object.getOwnPropertyDescriptor(window,'abyss').get;
      return {attached:true};
    })()`;
    const installed=await session.send('Debugger.evaluateOnCallFrame',{callFrameId:event.callFrames[0].callFrameId,expression,returnByValue:true});
    if(installed.exceptionDetails)throw Error(installed.exceptionDetails.exception?.description||'Memory scope unavailable');
  } finally {
    clearTimeout(timeout);
    await session.send('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId}).catch(()=>{});
    await session.send('Debugger.resume').catch(()=>{});
    await triggered;
    await session.send('Debugger.disable');
    await session.detach().catch(()=>{});
  }
  return true;
}

async function main(){
  let control={enabled:false,suspended:false,prediction:true},lastControl=Date.now(),context=null,page=null,running=true,closing=false;
  const input=createInterface({input:process.stdin});
  input.on('line',line=>{try{const value=JSON.parse(line);if(value&&typeof value==='object'&&!Array.isArray(value)){control={...control,...value};lastControl=Date.now();}}catch{}});
  const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
  const close=async()=>{
    running=false;
    if(closing)return;
    closing=true;
    await page?.evaluate(()=>window.__abyssMemoryAim?.stop()).catch(()=>{});
    await context?.close().catch(()=>{});
    input.close();process.stdin.pause();
  };
  input.on('close',()=>void close());
  process.on('SIGTERM',close);process.on('SIGINT',close);
  try{
    const profile=process.env.ABYSS_TRAINER_PROFILE||fileURLToPath(new URL('.chrome-profile/',import.meta.url));await mkdir(profile,{recursive:true});
    context=await chromium.launchPersistentContext(profile,{
      headless:false,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      viewport:null,args:['--no-first-run','--no-default-browser-check'],timeout:60000,
      handleSIGTERM:false,handleSIGINT:false
    });
    if(!running)return;
    context.on('close',()=>{running=false;input.close();process.stdin.pause();});
    let browserPid=0;
    const browserSession=await context.browser().newBrowserCDPSession();
    try{const processes=await browserSession.send('SystemInfo.getProcessInfo');browserPid=processes.processInfo.find(p=>p.type==='browser')?.id||0;}finally{await browserSession.detach();}
    page=context.pages()[0]||await context.newPage();
    const url=process.argv[2]||'http://127.0.0.1:5173';
    emit({message:'Opening managed game browser',connected:false});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    let attached=false,generation=-1;
    while(running&&!page.isClosed()){
      try{
        if(control.generation!==generation){generation=control.generation;attached=false;}
        if(!attached||!(await page.evaluate(()=>!!window.__abyssMemoryAim&&window.__abyssMemoryGetter===Object.getOwnPropertyDescriptor(window,'abyss')?.get))){await attachMemory(page);attached=true;}
        const options={...control,enabled:!!control.enabled&&Date.now()-lastControl<500};
        const data=await page.evaluate(options=>{
          const state=window.__abyssMemoryAim.control(options),rect=document.querySelector('#game').getBoundingClientRect();
          return {...state,connected:true,documentFocused:document.hasFocus(),viewport:{screenX,screenY,outerWidth,outerHeight,innerWidth,innerHeight,devicePixelRatio,
            rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}};
        },options);
        emit({...desktopTelemetry(data,control.displays),browserPid});
      }catch(error){
        attached=false;if(!running||page.isClosed())break;
        emit({connected:false,active:false,error:true,message:error.message});
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      await new Promise(resolve=>setTimeout(resolve,33));
    }
  }finally{
    await close();await context?.close().catch(()=>{});
    process.removeListener('SIGTERM',close);process.removeListener('SIGINT',close);
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{process.stdout.write(JSON.stringify({connected:false,error:true,message:error.message})+'\n');process.exitCode=1;});
