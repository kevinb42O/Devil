import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

const directory='artifacts/enemy-scene-lighting';
await mkdir(directory,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:800,height:800}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('**/enemy-scene-lighting-test',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:black"><canvas></canvas>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/enemy-scene-lighting-test');
 const {results,physicalChecks}=await page.evaluate(async()=>{
  const [THREE,{RemakeEnemies},{EnvironmentLighting},{ENEMY_KINDS,isPede,isSkull,isEgg}]=await Promise.all([
   import('/node_modules/.vite/deps/three.js'),import('/src/remake-enemies.ts'),import('/src/environment-lighting.ts'),import('/src/enemy-kinds.ts')
  ]);
  const environment=new EnvironmentLighting(),assets=new RemakeEnemies(environment);await assets.loaded;
  if(!assets.ready)throw Error(assets.error);
  environment.update(510);assets.setTime(0);
  const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});renderer.setSize(800,800);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0);
  const camera=new THREE.PerspectiveCamera(38,1,.01,1000);
  const light=new THREE.DirectionalLight(0xffffff,0);scene.add(light,light.target);
  const target=new THREE.WebGLRenderTarget(128,128,{type:THREE.FloatType});
  const data=new Float32Array(128*128*4);
  const sample=()=>{
   renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,128,128,data);renderer.setRenderTarget(null);
   const rgb=[0,0,0];for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)rgb[c]+=data[i+c];return rgb;
  };
  const rows=[];
  const inspect=(kind,variant,model)=>{
   scene.add(model);model.updateMatrixWorld(true);
   const materials=new Set();model.traverse(node=>{if(node.isMesh){
    for(const material of Array.isArray(node.material)?node.material:[node.material]){
     if(!material.isMeshStandardMaterial)throw Error(`Unlit enemy surface: ${kind}/${node.name}/${material.name}`);
     materials.add(material.name);
    }
   }});
   const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
   const distance=Math.max(size.x,size.y,size.z)*2.2;
   const direction=new THREE.Vector3(.35,.2,1).normalize();
   camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
   light.target.position.copy(center);light.position.copy(center).addScaledVector(direction,20);
   light.intensity=0;const dark=sample();light.intensity=4;light.color.set(0xffffff);const front=sample();
   light.position.copy(center).addScaledVector(direction,-20);const back=sample();
   light.position.copy(center).addScaledVector(direction,20);light.color.setRGB(1,0,0);const red=sample();
   light.color.setRGB(0,0,1);const blue=sample();
   rows.push({kind,variant,materials:[...materials],dark,front,back,red,blue});
   light.color.set(0xffffff);renderer.render(scene,camera);
   scene.remove(model);
  };
  for(const kind of ENEMY_KINDS){
   inspect(kind,'model',assets.clone(kind));
   if(isPede(kind))for(const alive of [true,false])inspect(kind,alive?'segment':'broken-segment',assets.segment(alive,kind));
   if(isSkull(kind)||isEgg(kind)||kind==='spiderling'){
    const group=new THREE.Group();for(const mesh of assets.createSwarmBatch(kind,1)){
     mesh.count=1;mesh.setMatrixAt(0,new THREE.Matrix4());mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
    }
    inspect(kind,'instanced',group);
   }
  }
  // A plain body patch must receive light, never manufacture its own fill or
  // camera-facing outline. Full models intentionally retain glowing eyes.
  const {prepareEnemySurfaceGeometry}=await import('/src/enemy-surface-material.ts');
  const {EnemyLighting}=await import('/src/enemy-lighting.ts');
  const {World}=await import('/src/simulation.ts');
  let bodyMaterial;assets.clone('skull4').traverse(node=>{if(node.material?.userData.enemySurface?.role==='body')bodyMaterial=node.material;});
  const geometry=new THREE.SphereGeometry(1,32,24);prepareEnemySurfaceGeometry(geometry,'body');
  geometry.setAttribute('motionWeight',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count),1));
  const body=new THREE.Mesh(geometry,bodyMaterial);scene.add(body);
  camera.position.set(0,0,4);camera.lookAt(0,0,0);light.intensity=0;environment.update(510);
  const sum=rgb=>rgb.reduce((a,b)=>a+b,0),unlitBody=sum(sample());
  environment.update(180);const skyReflection=sum(sample());
  environment.update(400);
  const at=(x,z)=>{body.position.set(x,1,z);camera.position.set(x,1,z+4);camera.lookAt(x,1,z);return sum(sample());};
  const shaft=at(12,0),outsideShaft=at(80,80);
  at(12,0);scene.remove(body);
  const instance=new THREE.InstancedMesh(geometry,bodyMaterial,1);instance.setMatrixAt(0,new THREE.Matrix4().makeTranslation(12,1,0));scene.add(instance);
  const instancedShaft=sum(sample());
  const field=new EnemyLighting(new THREE.Scene(),new THREE.MeshBasicMaterial());
  const world=new World(1,{schedule:false});world.time=0;
  const enemy=world.spawn('skull',{x:0,y:0,z:0},false);enemy.age=20;enemy.pos={x:0,y:0,z:0};
  const contact=()=>{field.update(world,camera,false,()=>[]);let max=0;for(let i=3;i<field.pixels.length;i+=4)max=Math.max(max,field.pixels[i]);return max;};
  const groundContact=contact(),singleField=[...field.pixels];
  const overlap=world.spawn('skull',{x:0,y:0,z:0},false);overlap.age=20;overlap.pos={...enemy.pos};contact();
  const contactBounded=singleField.every((v,i)=>v===field.pixels[i]);world.enemies=[enemy];enemy.pos.y=12;const highContact=contact();field.clear();
  const contactCleared=field.pixels.every(v=>v===0);
  target.dispose();geometry.dispose();renderer.dispose();
  return {results:rows,physicalChecks:{unlitBody,skyReflection,shaft,outsideShaft,instancedShaft,groundContact,highContact,contactBounded,contactCleared}};
 });
 for(const row of results){
  const label=`${row.kind}/${row.variant}`,sum=rgb=>rgb.reduce((a,b)=>a+b,0);
  assert.ok(sum(row.front)>sum(row.dark)+1,`${label} must receive scene light`);
  assert.ok(sum(row.front)>sum(row.back)*1.03,`${label} must respond to light direction`);
  assert.ok(row.red[0]>row.blue[0]+1,`${label} must receive red light`);
  assert.ok(row.blue[2]>row.red[2]+1,`${label} must receive blue light`);
 }
 assert.equal(results.filter(row=>row.variant==='model').length,22);
 assert.ok(physicalChecks.unlitBody<.001,`ordinary body surfaces must not emit light: ${physicalChecks.unlitBody}`);
 assert.ok(physicalChecks.skyReflection>1,'creatures must receive the shared veil sky');
 assert.ok(physicalChecks.shaft>physicalChecks.outsideShaft+1,'cathedral shafts must follow world position');
 assert.ok(Math.abs(physicalChecks.shaft-physicalChecks.instancedShaft)<physicalChecks.shaft*.001,'instanced creatures must share spatial lighting');
 assert.ok(physicalChecks.groundContact>physicalChecks.highContact+30,'contact occlusion must fade with height');
 assert.ok(physicalChecks.contactBounded&&physicalChecks.contactCleared);
 assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({results,physicalChecks,errors},null,2));
 console.log('Physical integration:',JSON.stringify(physicalChecks));
 console.log(`Enemy scene lighting passed: ${results.length} model, segment and instanced variants; direction and red/blue illumination verified.`);
}finally{await browser.close();}
