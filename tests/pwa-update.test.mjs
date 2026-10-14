import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function worker(){
 const handlers={},saved=new Map([['/index.html',new Response('old release')]]);
 let offline=false,activated=false,claimed=false;
 const cache={match:async key=>saved.get(key)?.clone(),put:async(key,value)=>saved.set(key,value),add:async()=>{}};
 const self={location:{origin:'https://game.example'},clients:{claim:async()=>{claimed=true;}},skipWaiting:async()=>{activated=true;},addEventListener:(name,fn)=>{handlers[name]=fn;}};
 runInNewContext(readFileSync('tools/pwa-worker.js','utf8').replace('__VERSION__','"test"').replace('__CORE__','[]'),{
  self,Request:class extends Request{constructor(input,options){super(input.url??input,options);}},Response,Headers,URL,caches:{open:async()=>cache,keys:async()=>[]},
  fetch:async()=>{if(offline)throw Error('offline');return new Response('new release');}
 });
 return {handlers,saved,setOffline:()=>{offline=true;},activated:()=>activated,claimed:()=>claimed};
}
async function navigate(w){
 let response;const pending=[];
 w.handlers.fetch({request:{url:'https://game.example/',method:'GET',mode:'navigate',headers:new Headers()},waitUntil:p=>pending.push(p),respondWith:p=>{response=p;}});
 const result=await response;await Promise.all(pending);return result.text();
}
test('online navigation replaces a cached old release; offline navigation retains it',async()=>{
 const w=worker();assert.equal(await navigate(w),'new release');
 assert.equal(await w.saved.get('/index.html').clone().text(),'new release');
 w.setOffline();assert.equal(await navigate(w),'new release');
});
test('a downloaded update activates while game windows are still open',async()=>{
 const w=worker();let pending;
 w.handlers.install({waitUntil:p=>{pending=p;}});await pending;assert.equal(w.activated(),true);
 w.handlers.activate({waitUntil:p=>{pending=p;}});await pending;assert.equal(w.claimed(),true);
});
