import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {paintPageOverlay} from './page-overlay.mjs';

const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage();
  await page.setContent('<button style="position:fixed;left:15px;top:15px;width:400px;height:70px" onclick="this.textContent=\'CLICK PASSED\'">Click me</button><input style="position:fixed;top:100px" aria-label="typing">');
  await page.evaluate(paintPageOverlay,{state:{focused:true,candidates:[]},options:{hud_enabled:true},rect:{left:0,top:0,width:1000,height:700}});
  await page.mouse.click(100,40);
  assert.equal(await page.locator('button').textContent(),'CLICK PASSED','click through the painted HUD');
  await page.getByRole('textbox').click();await page.keyboard.type('keyboard works');
  assert.equal(await page.getByRole('textbox').inputValue(),'keyboard works');
  assert.equal(await page.locator('#__abyssTrainerOverlay').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  // Record actual canvas drawing to check the settings affect what is painted.
  await page.evaluate(()=>{
    const ctx=document.getElementById('__abyssTrainerOverlay').getContext('2d');window.drawCalls=[];
    for(const name of ['arc','fillText','strokeRect','lineTo','fillRect']){
      const original=ctx[name].bind(ctx);ctx[name]=(...args)=>{window.drawCalls.push({name,args});return original(...args);};
    }
  });
  const rect={left:0,top:0,width:1000,height:700};
  for(const fov of [60,120,180,360]){
    await page.evaluate(()=>window.drawCalls=[]);
    await page.evaluate(paintPageOverlay,{state:{focused:true,candidates:[],cameraFov:90},options:{esp_fov:true,fov,hud_enabled:false},rect});
    const calls=await page.evaluate(()=>window.drawCalls);
    assert.equal(calls.filter(c=>c.name==='arc').length,1,`FOV circle visible at ${fov} degrees`);
    if(fov===360)assert(calls.some(c=>c.name==='fillText'&&c.args[0].includes('ALL DIRECTIONS')));
  }
  await page.evaluate(()=>window.drawCalls=[]);
  await page.evaluate(paintPageOverlay,{state:{focused:true,candidates:[]},options:{esp_fov:false,hud_enabled:false},rect});
  assert.equal((await page.evaluate(()=>window.drawCalls)).length,0,'circle and HUD can be turned off');
  const target={id:'1',enemy:1,kind:'skull',aimable:true,box:[20,120,40,40],x:40,y:140,distance:12.4,health:5,maxHealth:10,lead:{box:[0,0,4,4],x:70,y:140}};
  await page.evaluate(paintPageOverlay,{state:{focused:true,target,candidates:[target]},options:{esp_fov:false,esp_style:'corners',hud_anchor:'bottom_right',hud_compact:false,esp_distance:true,esp_prediction:true},rect});
  const drawn=await page.evaluate(()=>window.drawCalls);
  assert(drawn.some(c=>c.name==='fillText'&&c.args[0].includes('12.4 u')),'distance label is drawn');
  assert(drawn.some(c=>c.name==='lineTo'&&c.args[0]===74),'prediction marker is drawn');
  assert(drawn.some(c=>c.name==='fillText'&&c.args[0].includes('aim updates')),'detailed HUD is drawn');
  assert(!drawn.some(c=>c.name==='strokeRect'),'corner style uses corner segments');
  console.log('PASS: clicks through painted HUD and normal keyboard input with trainer overlay mounted.');
  console.log('PASS: FOV circle 60/120/180/360, off switch, distance, corner boxes, prediction and detailed HUD.');
}finally{await browser.close();}
