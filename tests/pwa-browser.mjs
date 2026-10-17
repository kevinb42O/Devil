import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const url=process.env.GAME_URL||'http://127.0.0.1:5180';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile=mkdtempSync(join(tmpdir(),'abyss-pwa-'));
const browser=await chromium.launchPersistentContext(profile,{viewport:{width:844,height:390},isMobile:true,hasTouch:true,headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
mkdirSync('artifacts/pwa',{recursive:true});
try{
 const context=browser;
 await context.addInitScript(()=>localStorage.setItem('abyss-player-profile',JSON.stringify({name:'PWA audit',configured:true,automatic:false})));
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('#start')?.disabled===false);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:90000});
 await page.waitForFunction(()=>!document.querySelector('#offline-save').disabled);
 const session=await context.newCDPSession(page);
 const {data,errors:manifestErrors}=await session.send('Page.getAppManifest');
 assert.deepEqual(manifestErrors,[],'valid web app manifest');
 const metadata=JSON.parse(data||await page.evaluate(async()=>await(await fetch('/manifest.webmanifest')).text()));
 assert.equal(metadata.display,'fullscreen');assert.equal(metadata.orientation,'landscape');
 const installability=await session.send('Page.getInstallabilityErrors');
 assert.deepEqual(installability.installabilityErrors,[],'Chrome installability checks');
 for(const icon of metadata.icons){assert.equal(await page.evaluate(async icon=>{const img=new Image();img.src=icon.src;await img.decode();return `${img.naturalWidth}x${img.naturalHeight}`;},icon),icon.sizes);}
 assert.equal(await page.locator('link[rel=apple-touch-icon]').getAttribute('sizes'),'180x180');
 await page.locator('#install-open').tap();
 await page.locator('#offline-status').filter({hasText:/MB/}).waitFor();
 await page.screenshot({path:'artifacts/pwa/install-landscape.png'});
 // Android's deferred prompt must be invoked by a tap, not on page load.
 await page.evaluate(()=>{const event=new Event('beforeinstallprompt');event.prompt=async()=>{window.installTapped=true;};event.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(event);});
 await page.locator('#install-app').tap();assert.equal(await page.evaluate(()=>window.installTapped),true);
 await page.locator('#offline-save').tap();
 await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.startsWith('Game saved.'),null,{timeout:240000});
 const pack=await page.evaluate(async()=>await(await fetch('/offline-pack.json')).json());
 assert.ok(pack.files.some(path=>path.endsWith('/menutheme.m4a')));
 await context.setOffline(true);
 // A fresh document needs every dependency from the worker, not memory cache.
 await page.reload();await page.waitForFunction(()=>document.querySelector('#start')?.disabled===false);
 await page.waitForFunction(()=>!document.querySelector('#offline-save').disabled);
 await page.locator('#install-open').tap();await page.locator('#offline-status').filter({hasText:/Game saved/}).waitFor();
 const range=await page.evaluate(async()=>{const r=await fetch('/assets/audio/remake/menutheme.m4a',{headers:{Range:'bytes=0-99'}});return {status:r.status,range:r.headers.get('content-range'),length:(await r.arrayBuffer()).byteLength};});
 assert.equal(range.status,206);assert.equal(range.length,100);assert.match(range.range,/^bytes 0-99\//);
 await page.locator('#install-close').tap();await page.locator('#start').tap();
 await page.waitForFunction(()=>document.querySelector('#menu').hidden);
 assert.equal(await page.evaluate(()=>document.body.dataset.controls),'mobile');
 await page.screenshot({path:'artifacts/pwa/offline-game.png'});
 assert.deepEqual(errors,[],'offline launch has no script errors');
 await context.close();
 console.log('PWA passed: Chrome installability, icons, install prompt, full offline download, cold offline startup, range audio and touch game launch.');
}finally{await browser.close();rmSync(profile,{recursive:true,force:true});}
// WebKit emulates the iPhone installation guidance and installed display mode.
const safari=await webkit.launch({headless:true});
try{
 const context=await safari.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 const page=await context.newPage();await page.goto(url);await page.locator('#install-open').tap();
 await page.locator('#install-instructions').filter({hasText:/Add to Home Screen/}).waitFor();
 await page.screenshot({path:'artifacts/pwa/iphone-install.png'});
 await page.locator('#install-close').tap();
 await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}));
 await page.locator('#install-open').tap();
 assert.match(await page.locator('#install-instructions').textContent(),/installed app/);
 assert.equal(await page.locator('#fullscreen-toggle').isVisible(),false);
 await context.close();console.log('WebKit passed: iPhone installation guidance, standalone detection and browserless UI.');
}finally{await safari.close();}
