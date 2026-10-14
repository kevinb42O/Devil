import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const oldWorker=execFileSync('git',['show','7fc336d:tools/pwa-worker.js'],{encoding:'utf8'});
const newWorker=readFileSync('tools/pwa-worker.js','utf8');let upgraded=false;
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/sw.js'){
  res.setHeader('Content-Type','text/javascript');
  res.end((upgraded?newWorker:oldWorker).replace('__VERSION__',JSON.stringify(upgraded?'new':'old')).replace('__CORE__','["/index.html","/ui/champion-flame.svg"]'));
 }else if(req.url==='/ui/champion-flame.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(`<svg xmlns="http://www.w3.org/2000/svg" data-release="${upgraded?'new':'old'}"/>`);
 }else {res.setHeader('Content-Type','text/html');res.end(`<h1>${upgraded?'new':'old'}</h1>`);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const context=await browser.newContext(),page=await context.newPage();await page.goto(url);
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 assert.equal(await page.locator('h1').textContent(),'old');
 assert.match(await page.evaluate(async()=>await(await fetch('/ui/champion-flame.svg')).text()),/data-release="old"/);
 upgraded=true;
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
 await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing&&!r.waiting&&r.active?.state==='activated'&&navigator.serviceWorker.controller===r.active&&(await caches.keys()).includes('abyss-pwa-new');});
 await page.reload();assert.equal(await page.locator('h1').textContent(),'new','reload updates without closing the existing window');
 assert.match(await page.evaluate(async()=>await(await fetch('/ui/champion-flame.svg')).text()),/data-release="new"/,'unhashed flame artwork updates with the worker cache');
 assert.deepEqual(await page.evaluate(()=>caches.keys()),['abyss-pwa-new'],'obsolete release cache is removed');
 await context.setOffline(true);await page.reload();assert.equal(await page.locator('h1').textContent(),'new','updated page remains available offline');
 assert.match(await page.evaluate(async()=>await(await fetch('/ui/champion-flame.svg')).text()),/data-release="new"/,'updated flame artwork is available offline');
 console.log('PWA update browser passed: old cached release upgrades in an open window; reload shows new release; offline reload still works.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
