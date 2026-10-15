import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportGeometry,desktopTelemetry} from './geometry.mjs';
const display={left:0,top:0,width:1440,height:900,scale:2};
const base={screenX:100,screenY:50,outerWidth:1000,outerHeight:800,innerWidth:1000,innerHeight:700,devicePixelRatio:2,rect:{left:0,top:0,width:1000,height:700}};
test('Retina 100 percent zoom keeps desktop coordinates',()=>{
  assert.deepEqual(viewportGeometry(base,[display]),{zoom:1,region:{left:100,top:150,width:1000,height:700}});
});
test('browser zoom does not shift the overlay into the toolbar',()=>{
  const view={...base,innerWidth:800,innerHeight:560,devicePixelRatio:2.5,rect:{left:0,top:0,width:800,height:560}};
  assert.deepEqual(viewportGeometry(view,[display]),{zoom:1.25,region:{left:100,top:150,width:1000,height:700}});
  const data=desktopTelemetry({viewport:view,target:{x:400,y:280,box:[395,275,10,10],lead:{x:420,y:280,box:[0,0,5,5]}},candidates:[{arrow:{x:10,y:20,angle:1}}]},[display]);
  assert.equal(data.target.x,500);assert.deepEqual(data.target.box,[493.75,343.75,12.5,12.5]);assert.equal(data.target.lead.x,525);assert.equal(data.candidates[0].arrow.x,12.5);
});
test('mixed-density monitor at negative desktop coordinates',()=>{
  const view={...base,screenX:-1800,devicePixelRatio:1};
  const other={left:-1920,top:0,width:1920,height:1080,scale:1};
  assert.equal(viewportGeometry(view,[display,other]).region.left,-1800);
  assert.equal(viewportGeometry(view,[display,other]).zoom,1);
});
test('fullscreen viewport has no toolbar offset',()=>{
  const view={...base,screenX:0,screenY:0,outerWidth:1440,outerHeight:900,innerWidth:1440,innerHeight:900,rect:{left:0,top:0,width:1440,height:900}};
  assert.deepEqual(viewportGeometry(view,[display]).region,{left:0,top:0,width:1440,height:900});
});
