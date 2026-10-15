/** Convert tiko479's CC0 FBX meshes without generating or replacing their geometry. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
const input=process.argv[2];if(!input)throw Error('Pass the extracted Soccer Field.fbx path');
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result='data:application/octet-stream;base64,'+Buffer.from(v).toString('base64');this.onloadend?.();});}};
const bytes=readFileSync(input),root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');root.updateMatrixWorld(true);
const dest='public/models/football';mkdirSync(dest,{recursive:true});const records=[];
for(const [source,file]of [['Soccer_Field','pitch.glb'],['Soccer_Goal001','goal.glb']]){
 const original=root.getObjectByName(source),model=new THREE.Mesh(original.geometry.clone(),original.material.map(m=>new THREE.MeshStandardMaterial({name:m.name,color:m.color,roughness:.95,side:THREE.DoubleSide})));
 model.geometry.applyMatrix4(original.matrixWorld);model.geometry.rotateY(Math.PI/2);model.geometry.computeBoundingBox();const box=model.geometry.boundingBox,center=box.getCenter(new THREE.Vector3());
 model.geometry.translate(-center.x,-(source==='Soccer_Field'?3.677:box.min.y),-center.z);
 // Only the original grass material receives texture coordinates for the downloaded grass maps.
 if(source==='Soccer_Field'){const pos=model.geometry.attributes.position,uv=new Float32Array(pos.count*2);for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i)/100;uv[i*2+1]=pos.getZ(i)/100;}model.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));}
 if(source!=='Soccer_Field'){
  // The CC0 net planes have no UVs. Project the downloaded net texture onto each face.
  model.geometry.computeBoundingBox();const size=model.geometry.boundingBox.getSize(new THREE.Vector3()),pos=model.geometry.attributes.position,norm=model.geometry.attributes.normal,uv=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){const x=pos.getX(i)*9/size.x,y=pos.getY(i)*3.4/size.y,z=pos.getZ(i)*3/size.z,ny=Math.abs(norm.getY(i)),nx=Math.abs(norm.getX(i)),nz=Math.abs(norm.getZ(i));uv[i*2]=(nx>nz?z:x)/2;uv[i*2+1]=(ny>Math.max(nx,nz)?z:y)/.75;}
  model.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
 }
 const out=await new GLTFExporter().parseAsync(model,{binary:true});writeFileSync(`${dest}/${file}`,Buffer.from(out));records.push({file,source,sha256:createHash('sha256').update(Buffer.from(out)).digest('hex')});
}
writeFileSync(`${dest}/LICENSE.md`,'Models: Soccer Field by tiko479, CC0 1.0. https://opengameart.org/content/soccer-field\nOriginal download: https://opengameart.org/sites/default/files/soccer_field.zip\nFBX mesh selection, coordinate normalization and GLB conversion; authored mesh topology unchanged. Pitch and goal UVs supplied for downloaded grass and net textures.\n\nGrass004 by ambientCG, CC0 1.0. https://ambientcg.com/view?id=Grass004\nDownload: https://ambientcg.com/get?file=Grass004_1K-JPG.zip\nColor and normal maps used unchanged.\n\nGoal net texture: soccerGoal by almaPerdida, CC0 1.0. https://opengameart.org/content/soccergoal\nOriginal download: https://opengameart.org/sites/default/files/soccergoal.zip. net.png used unchanged.\n');
mkdirSync('assets/provenance/football',{recursive:true});writeFileSync('assets/provenance/football/models.json',JSON.stringify({source:'https://opengameart.org/content/soccer-field',author:'tiko479',license:'CC0-1.0',sourceSha256:createHash('sha256').update(bytes).digest('hex'),models:records},null,2)+'\n');
