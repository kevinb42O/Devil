import {chromium,firefox,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const url=process.env.GAME_URL||'http://127.0.0.1:5180';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
 const browser=await engine.launch({headless:true,...(name==='chromium'&&existsSync(chrome)?{executablePath:chrome}:{})});
 try{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  const button=page.locator('#fullscreen-toggle');
  await button.waitFor();
  if(await button.isEnabled()){
   await button.click();
   await page.waitForFunction(()=>!!(document.fullscreenElement||document.webkitFullscreenElement));
   await page.waitForFunction(()=>document.querySelector('#fullscreen-toggle').getAttribute('aria-pressed')==='true');
   assert.equal(await page.locator('#fullscreen-label').textContent(),'EXIT FULLSCREEN');
   await button.click();
   await page.waitForFunction(()=>!(document.fullscreenElement||document.webkitFullscreenElement));
   await page.waitForFunction(()=>document.querySelector('#fullscreen-toggle').getAttribute('aria-pressed')==='false');
  }else{
   assert.match(await page.locator('#fullscreen-status').textContent(),/unavailable/);
  }
  for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
   await page.setViewportSize({width,height});
   const bounds=await button.boundingBox();const brand=await page.locator('#menu .brand').boundingBox();
   assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height,'fullscreen button fits viewport');
   assert.ok(brand.x+brand.width<=bounds.x,'fullscreen button does not overlap brand');
  }
  assert.deepEqual(errors,[],`${name} has no browser errors`);
  await page.close();
  // Exercise Safari's void-returning prefixed API, rejected requests, and
  // externally initiated exits independently of headless engine restrictions.
  for(const variant of ['prefixed','blocked','unavailable']){
   const test=await browser.newPage();
   await test.addInitScript(variant=>{
    let current=null;
    const define=(target,key,value)=>Object.defineProperty(target,key,{configurable:true,value});
    define(Element.prototype,'requestFullscreen',undefined);
    define(Document.prototype,'exitFullscreen',undefined);
    define(Document.prototype,'fullscreenEnabled',false);
    if(variant==='prefixed'){
     Object.defineProperty(Document.prototype,'webkitFullscreenElement',{configurable:true,get:()=>current});
     define(Document.prototype,'webkitFullscreenEnabled',true);
     define(Element.prototype,'webkitRequestFullscreen',function(){current=this;document.dispatchEvent(new Event('webkitfullscreenchange'));});
     define(Document.prototype,'webkitExitFullscreen',function(){current=null;document.dispatchEvent(new Event('webkitfullscreenchange'));});
    }else{
     define(Element.prototype,'webkitRequestFullscreen',undefined);
     define(Document.prototype,'webkitExitFullscreen',undefined);
     if(variant==='blocked'){
      define(Document.prototype,'fullscreenEnabled',true);
      define(Element.prototype,'requestFullscreen',()=>Promise.reject(new Error('Denied')));
      define(Document.prototype,'exitFullscreen',()=>Promise.resolve());
     }
    }
   },variant);
   await test.goto(url);const control=test.locator('#fullscreen-toggle');
   await control.waitFor();
   if(variant==='unavailable'){
    assert.equal(await control.isDisabled(),true);
    assert.match(await test.locator('#fullscreen-status').textContent(),/unavailable/);
   }else if(variant==='blocked'){
    await control.click();await test.waitForFunction(()=>document.querySelector('#fullscreen-status').textContent.includes('blocked'));
    assert.equal(await control.isEnabled(),true,'rejected requests can be retried');
    assert.equal(await control.getAttribute('aria-pressed'),'false');
   }else{
    await control.click();assert.equal(await control.getAttribute('aria-pressed'),'true');
    await test.evaluate(()=>document.webkitExitFullscreen());
    assert.equal(await control.getAttribute('aria-pressed'),'false','external exit updates label');
    await control.click();await control.click();assert.equal(await control.getAttribute('aria-pressed'),'false');
   }
   await test.close();
  }
  console.log(`${name}: fullscreen toggle, responsive layout, prefixed API, denial and unsupported fallback passed.`);
 }finally{await browser.close();}
}
