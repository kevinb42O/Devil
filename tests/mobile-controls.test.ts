import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MobileControls} from '../src/mobile-controls';
import {gameViewport,gamePoint} from '../src/game-viewport';
test('left tap jumps once; left hold or drag only moves',()=>{
 const controls=new MobileControls();controls.begin({id:1,x:100,y:250},800,0);controls.end(1,80);
 assert.deepEqual(controls.drain(),[{button:'jump',held:true},{button:'jump',held:false}]);assert.deepEqual(controls.drain(),[]);
 controls.begin({id:2,x:100,y:250},800,100);controls.move({id:2,x:100,y:170});assert.ok(controls.sample(390).forward>.9);assert.equal(controls.drain().length,0);controls.end(2,500);assert.equal(controls.sample(390).forward,0);assert.deepEqual(controls.drain(),[]);
 controls.begin({id:3,x:100,y:250},800,600);controls.move({id:3,x:140,y:250});controls.end(3,680);assert.deepEqual(controls.drain(),[],'quick movement drag never jumps');
});
test('right touch holds fire and relative drag aims while left remains independent',()=>{
 const controls=new MobileControls();controls.begin({id:1,x:100,y:250},800,0);controls.begin({id:2,x:650,y:250},800,0);
 controls.move({id:1,x:140,y:210});controls.move({id:2,x:680,y:220});
 const sample=controls.sample(390);assert.ok(sample.forward>0&&sample.strafe>0);assert.equal(sample.lookX,30);assert.equal(sample.lookY,-30);
 assert.equal(controls.sample(390).lookX,0,'stationary hold does not keep turning');assert.deepEqual(controls.drain(),[{button:'fire',held:true}]);
 controls.end(2,80);assert.deepEqual(controls.drain(),[{button:'fire',held:false}]);assert.ok(controls.sample(390).forward>0,'releasing aim does not stop movement');
});
test('a finger keeps ownership of its initial half and extra fingers cannot steal it',()=>{
 const controls=new MobileControls();assert.ok(controls.begin({id:1,x:100,y:200},800,0));assert.equal(controls.begin({id:2,x:200,y:200},800,0),false);
 controls.move({id:1,x:600,y:200});assert.equal(controls.sample(390).strafe,1);assert.deepEqual(controls.drain(),[]);assert.equal(controls.end(2,40),false);
 controls.end(1,60,true);assert.deepEqual(controls.drain(),[],'cancel is never a jump');
});
test('reset discards held actions and pending aim so resume starts with fresh touches',()=>{
 const controls=new MobileControls();controls.begin({id:1,x:650,y:250},800,0);controls.move({id:1,x:700,y:210});controls.reset();
 assert.equal(controls.active,false);assert.deepEqual(controls.sample(390),{forward:0,strafe:0,lookX:0,lookY:0});assert.deepEqual(controls.drain(),[]);assert.equal(controls.end(1,80),false);
});
test('portrait fallback renders landscape and remaps both touch axes',()=>{
 const portrait=gameViewport(390,844,true);assert.deepEqual(portrait,{width:844,height:390,rotated:true});
 assert.deepEqual(gamePoint(140,100,portrait),{x:100,y:250});assert.deepEqual(gamePoint(140,650,portrait),{x:650,y:250});
 assert.deepEqual(gameViewport(844,390,true),{width:844,height:390,rotated:false});assert.deepEqual(gameViewport(390,844,false),{width:390,height:844,rotated:false});
});
