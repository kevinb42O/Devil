import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const output='artifacts/enemy-gallery';await mkdir(output,{recursive:true});
const groups=[
 {title:'Spawners and eggs',file:'spawners',items:[
  ['squid','Squid I','Tower spawner · Skull I + Skull II'],['squid2','Squid II','Tower spawner · Skull I + Skull III'],['squid3','Squid III','Tower spawner · Skull I + Skull IV'],
  ['spider','Spider I','Gem-eating spawner · Egg I'],['spider2','Spider II','Gem-eating spawner · Egg II'],['egg','Egg I','Hatches five spiderlings'],['egg2','Egg II','Hatches five spiderlings']]},
 {title:'Skulls and spiderling',file:'swarm',items:[
  ['skull','Skull I','Swarm enemy'],['skull2','Skull II','Swarm enemy'],['skull3','Skull III','Swarm enemy'],['skull4','Skull IV','Swarm enemy'],
  ['transmuted1','Transmuted Skull I','Transmuted swarm enemy'],['transmuted2','Transmuted Skull II','Transmuted swarm enemy'],['transmuted3','Transmuted Skull III','Transmuted swarm enemy'],['transmuted4','Transmuted Skull IV','Transmuted swarm enemy'],['spiderling','Spiderling','Hatched swarm enemy']]},
 {title:'Segmented enemies',file:'pedes',items:[['centipede','Centipede','25 weak-point segments'],['gigapede','Gigapede','50 weak-point segments'],['ghostpede','Ghostpede','10 weak-point segments · consumes homing daggers']]},
 {title:'Bosses and hazard',file:'bosses',items:[['leviathan','Leviathan','Boss · transmutation rings'],['orb','Orb','Boss · transmutation rings'],['thorn','Thorn','Stationary hazard']]},
];
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(url+'/enemy-gallery-capture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>html,body{margin:0;background:#080b0b;overflow:hidden}canvas{display:block}</style></head><body><canvas id="capture"></canvas></body></html>'}));
 await page.goto(url+'/enemy-gallery-capture');
 await page.evaluate(async()=>{
  const [THREE,{GameRenderer},{World,v},{isPede,isSpider},{enemyYaw}]=await Promise.all([import('/node_modules/three/build/three.module.js'),import('/src/renderer.ts'),import('/src/simulation.ts'),import('/src/enemy-kinds.ts'),import('/src/enemy-presentation.ts')]);
  const renderer=new GameRenderer(document.querySelector('#capture'),{quality:'high',fov:45});await renderer.prepare();
  renderer.scene.fog=null;renderer.scene.background=new THREE.Color(0x080b0b);
  window.captureEnemy=(kind,headOnly=false)=>{
   renderer.clear();const w=new World(731,{schedule:false,invulnerable:true}),e=w.spawn(kind,v());
   w.time=15;e.age=15;e.activeAt=0;e.status='hunting';e.headExposure=1;e.phase=0;e.facingYaw=0;e.vel=v(0,0,1);e.nextSpawn=Infinity;e.nextBeckon=Infinity;
   e.pos=v(0,isSpider(kind)?2.7*e.size:kind==='leviathan'?15:kind==='thorn'?0:isPede(kind)?5:3,0);
   if(kind.startsWith('squid')){e.facingYaw=-((e.towerSpinDirection??-1)*e.age*.28);e.pos.y=kind==='squid'?4:kind==='squid2'?6:8;}
   if(isPede(kind)){
    // Freeze a continuous, surfaced curve so every body segment can be inspected.
    const radius=e.segments.length*1.3*e.size/(Math.PI*1.65);
    for(let i=0;i<e.segments.length;i++){const d=(i+1)*1.3*e.size,angle=d/radius;e.segments[i].pos=v(radius*(1-Math.cos(angle)),e.pos.y+Math.sin(d*.07)*1.5,-radius*Math.sin(angle));}
   }
   const model=renderer.originalEnemies.clone(kind);model.position.set(e.pos.x,e.pos.y,e.pos.z);model.rotation.y=enemyYaw(e,w.player.pos);
   if(isPede(kind)){
    model.rotation.set(0,0,0);for(let i=0;i<e.segments.length;i++){
     const s=e.segments[i],lead=i?e.segments[i-1].pos:e.pos,node=renderer.originalEnemies.segment(true,kind);
     node.position.set(s.pos.x-e.pos.x,s.pos.y-e.pos.y,s.pos.z-e.pos.z);node.rotation.set(-Math.atan2(lead.y-s.pos.y,Math.hypot(lead.x-s.pos.x,lead.z-s.pos.z)),Math.atan2(lead.x-s.pos.x,lead.z-s.pos.z),0,'YXZ');model.add(node);
    }
   }
   renderer.originalEnemies.animate(model,e,w.time);model.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(headOnly?model.children[0]:model),center=box.getCenter(new THREE.Vector3());
   const sight=new THREE.Vector3(isPede(kind)&&!headOnly?1.5:.8,isPede(kind)&&!headOnly?1.2:.38,1.8).normalize();
   const orientation=new THREE.PerspectiveCamera(45,1000/700,.05,600);orientation.position.copy(center).add(sight);orientation.lookAt(center);
   const inverse=orientation.quaternion.clone().invert(),tan=Math.tan(45*Math.PI/360);let distance=0;
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse);
    distance=Math.max(distance,p.z+Math.abs(p.x)/(tan*1000/700),p.z+Math.abs(p.y)/tan);
   }
   distance=Math.max(2,distance*1.2);const position=center.clone().addScaledVector(sight,distance),delta=center.clone().sub(position);
   renderer.camera.far=Math.max(180,distance*3);renderer.camera.updateProjectionMatrix();
   const yaw=Math.atan2(-delta.x,-delta.z),pitch=Math.atan2(delta.y,Math.hypot(delta.x,delta.z));
   w.player.pos=v(0,1.7,10);
   // Spectator camera suppresses the hand; actual game meshes, shaders, lighting
   // and postprocessing render the frozen enemy on the arena.
   for(let i=0;i<3;i++)renderer.render(w,yaw,pitch,0,false,1,v(position.x,position.y,position.z));
   return {kind,segments:e.segments.length,bounds:box.getSize(new THREE.Vector3()).toArray(),camera:position.toArray()};
  };
 });
 const expected=await page.evaluate(async()=>(await import('/src/enemy-kinds.ts')).ENEMY_KINDS);
 const requested=groups.flatMap(g=>g.items.map(([kind])=>kind));
 if(expected.length!==requested.length||expected.some(kind=>!requested.includes(kind)))throw Error('Gallery does not cover the complete runtime enemy roster');
 const manifest=[];
 for(const group of groups)for(const [kind,name,role] of group.items){
  const details=await page.evaluate(kind=>window.captureEnemy(kind),kind);
  await page.locator('#capture').screenshot({path:`${output}/${kind}.png`});
  if(group.file==='pedes'){await page.evaluate(kind=>window.captureEnemy(kind,true),kind);await page.locator('#capture').screenshot({path:`${output}/${kind}-head.png`});}
  manifest.push({kind,name,role,group:group.title,...details});console.log(`Captured ${name}`);
 }
 if(errors.length)throw Error(errors.join('\n'));
 const cards=items=>items.map(([kind,name,role])=>`<a class="card" href="${kind}.png"><img src="${kind}.png" alt="${name}"><div><h3>${name}</h3><p>${role}</p><code>${kind}</code>${['centipede','gigapede','ghostpede'].includes(kind)?`<img class="detail" src="${kind}-head.png" alt="${name} head detail">`:''}</div></a>`).join('');
 const style=`*{box-sizing:border-box}body{margin:0;padding:32px;background:#0b0e0e;color:#ede6d8;font-family:Arial,sans-serif}h1{font-size:30px;margin:0 0 8px}h2{font-size:24px;margin:32px 0 18px}header p{color:#a3aaa4;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{display:block;background:#141919;border:1px solid #303935;border-radius:8px;overflow:hidden;text-decoration:none;color:inherit}.card img{display:block;width:100%;aspect-ratio:10/7;object-fit:contain;background:#080b0b}.card div{padding:15px 17px}h3{font-size:21px;margin:0 0 7px}p{font-size:14px;color:#b4bdb5;margin:0 0 6px}code{font-size:12px;color:#808c82}.count{color:#d7a063;font-size:13px;letter-spacing:2px;margin-bottom:12px}body.pedes .grid{grid-template-columns:1fr}body.pedes .card{display:grid;grid-template-columns:3fr 1fr;align-items:center}body.pedes .card img{aspect-ratio:10/6;height:480px;object-fit:contain}body.pedes .card div{padding:24px}body.pedes h3{font-size:28px}.card img.detail{height:auto!important;width:100%;aspect-ratio:10/7;margin-top:20px;border:1px solid #303935;border-radius:4px}`;
 const html=(group)=>`<!doctype html><html><head><meta charset="utf-8"><title>${group.title}</title><style>${style}</style></head><body class="${group.file}"><header><div class="count">ABYSS DAGGERS · ENEMY GALLERY</div><h1>${group.title}</h1><p>Actual game-renderer screenshots · individually framed for visibility</p></header><div class="grid">${cards(group.items)}</div></body></html>`;
 for(const group of groups){await writeFile(`${output}/${group.file}.html`,html(group));}
 await writeFile(`${output}/index.html`,`<!doctype html><html><head><meta charset="utf-8"><title>All 22 enemies and spawners</title><style>${style}</style></head><body><header><div class="count">ABYSS DAGGERS · COMPLETE ROSTER</div><h1>All 22 enemies and spawners</h1><p>Click any screenshot to open it at full resolution. Framing varies; these are not scale comparisons.</p></header>${groups.map(g=>`<section><h2>${g.title}</h2><div class="grid">${cards(g.items)}</div></section>`).join('')}</body></html>`);
 for(const group of groups){
  await page.setViewportSize({width:group.file==='pedes'?1350:1440,height:400});
  await page.goto(`${url}/${output}/${group.file}.html`);await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:`${output}/${group.file}-sheet.png`,fullPage:true});
 }
 await writeFile(`${output}/manifest.json`,JSON.stringify(manifest,null,2));console.log(`Saved ${manifest.length} enemies, four sheets, and clickable gallery.`);
}finally{await browser.close();}
