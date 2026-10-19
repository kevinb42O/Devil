import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/balance-collider-audit',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
 await page.goto('http://127.0.0.1:5173/balance-collider-audit');
 const results=await page.evaluate(async()=>{
  const [THREE,{OriginalEnemies},{World,v},{sweepArmor},{enemyYaw,enemyEmergenceScale}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/original-enemies.ts'),import('/src/simulation.ts'),import('/src/projectile-collision.ts'),import('/src/enemy-presentation.ts')]);
  const assets=new OriginalEnemies();await assets.loaded;if(!assets.ready)throw Error(assets.error);
  const results=[];
  for(const kind of ['squid','squid2','squid3','leviathan','thorn'])for(const time of kind==='leviathan'?[0,.07,.23]:[0]){
   const w=new World(71,{schedule:false}),e=w.spawn(kind,v(0,kind==='leviathan'?12:5,0));e.age=12;
   const model=assets.clone(kind);assets.animate(model,e,time,true);model.position.set(e.pos.x,e.pos.y,e.pos.z);model.rotation.y=enemyYaw(e,w.player.pos);model.scale.setScalar(enemyEmergenceScale(e));model.updateMatrixWorld(true);
   const meshes=[];
   model.traverse(n=>{if(!n.isMesh||n.name.startsWith('weak-point-'))return;n.material.side=THREE.DoubleSide;
    // Apply the same body vertex displacement as the rendered shader.
    if(time&&n.material.userData.enemySurface?.role==='body'){
     n.geometry=n.geometry.clone();const positions=n.geometry.getAttribute('position'),weights=n.geometry.getAttribute('motionWeight');
     for(let i=0;i<positions.count;i++)positions.setY(i,positions.getY(i)+Math.sin(time*16)*(weights?.getX(i)??0)*Math.abs(positions.getX(i))*.32);
     n.geometry.computeBoundingBox();n.geometry.computeBoundingSphere();
    }
    meshes.push(n);});
   const box=new THREE.Box3();for(const mesh of meshes)box.union(new THREE.Box3().setFromObject(mesh));
   const ray=new THREE.Raycaster(),rows=[];let both=0,neither=0,invisibleArmor=0,visualOnly=0,depthMismatch=0;
   for(let h=0;h<24;h++)for(let angle=0;angle<48;angle++){
    const a=angle*Math.PI*2/48,y=box.min.y+(h+.5)/24*(box.max.y-box.min.y),from=v(Math.sin(a)*35,y,Math.cos(a)*35),to=v(-from.x,y,-from.z);
    const origin=new THREE.Vector3(from.x,y,from.z),direction=new THREE.Vector3(to.x-from.x,0,to.z-from.z).normalize();ray.set(origin,direction);ray.far=70;
    const visible=ray.intersectObjects(meshes,false)[0],collision=sweepArmor(e,w.player.pos,from,to,1,time,true);
    if(visible&&collision){both++;if(Math.abs(visible.distance-collision.t*70)>.001)depthMismatch++;}
    else if(visible)visualOnly++;
    else if(collision){invisibleArmor++;if(rows.length<3)rows.push({from,to,collisionDistance:collision.t*70});}
    else neither++;
   }
   results.push({kind,time,rays:24*48,both,neither,invisibleArmor,visualOnly,depthMismatch,examples:rows});
  }
  return results;
 });
 const report={note:'Two-sided horizontal raycasts through the actual loaded remake meshes (jewels excluded), compared with gameplay armor at the same pose. 24 heights x 48 azimuths per kind. Leviathan body deformation matches the visible shader at three times; towers and thorn use their actual procedural geometry.',results,errors};
 for(const result of results){assert.equal(result.invisibleArmor,0,result.kind);assert.equal(result.visualOnly,0,result.kind);assert.equal(result.depthMismatch,0,result.kind);}
 assert.deepEqual(errors,[]);
 await writeFile('artifacts/balance-audit/fixes/collider-alignment.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
