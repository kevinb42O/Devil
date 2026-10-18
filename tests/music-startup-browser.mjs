import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

const chrome=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
for(const autoplay of [true,false]){
 const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{}),args:[`--autoplay-policy=${autoplay?'no-user-gesture-required':'user-gesture-required'}`]});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:100}));
   const connect=AudioNode.prototype.connect;
   AudioNode.prototype.connect=function(destination,...args){
    if(destination===this.context.destination){
     const analyser=this.context.createAnalyser();analyser.fftSize=2048;
     connect.call(this,analyser);window.musicOutputs??=[];window.musicOutputs.push(analyser);
    }
    return connect.call(this,destination,...args);
   };
   window.musicPeak=()=>Math.max(0,...(window.musicOutputs??[]).map(analyser=>{
    const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
   }));
  });
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(()=>window.abyss?.music.tracks.some(t=>t.name==='menutheme'));
  if(!autoplay){
   await page.waitForFunction(()=>window.abyss.music.failed.includes('menutheme'));
   assert.equal(await page.evaluate(()=>window.musicPeak()),0,'blocked autoplay stays silent');
   await page.click('#settings-open');
  }
  await page.waitForFunction(()=>window.abyss.music.contextState==='running'&&window.musicPeak()>.001);
  assert.deepEqual(await page.evaluate(()=>window.abyss.music.failed),[]);
  assert.deepEqual(errors,[]);
  console.log(autoplay?'Menu startup: audible music without a click when autoplay is allowed.':'Menu startup: blocked autoplay recovers with audible music on the first click.');
 }finally{await browser.close();}
}
