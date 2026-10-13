import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { readToc, decodeMesh, decodeTexture, decodeShader, decodeParticles, selectedName } from './dd-archive.mjs';
const source=process.argv[2];if(!source){console.error('Usage: npm run assets:import -- /path/to/res/dd [/path/to/dd/particle]');process.exit(1);}
const dest=resolve('assets/original/devil-daggers');const data=await readFile(source);const entries=readToc(data).filter(e=>selectedName(e.name));
const requiredMeshes=['hand','hand2','hand3','hand4','dagger'];const requiredTextures=['hand','hand2','hand3','hand4','hand5','hand6','dagger','dagger2','dagger3','dagger4','dagger5','dagger6','emberflame'];
for(const name of requiredMeshes)if(!entries.some(e=>e.type===1&&e.name===name))throw Error(`Missing original mesh ${name}`);
for(const name of requiredTextures)if(!entries.some(e=>e.type===2&&e.name===name))throw Error(`Missing original texture ${name}`);
// Decode all assets before writing anything, so malformed input cannot yield a partial ready manifest.
const files=[];
for(const e of entries){
 if(e.type===1)files.push({path:`meshes/${e.name}.obj`,data:decodeMesh(e.data)});
 if(e.type===2)files.push({path:`textures/${e.name}.png`,data:decodeTexture(e.data)});
 if(e.type===0x80)files.push({path:`bindings/${e.name}.txt`,data:e.data});
 if(e.type===0x10){const shader=decodeShader(e.data);files.push({path:`shaders/${e.name}.vert`,data:shader.vertex},{path:`shaders/${e.name}.frag`,data:shader.fragment});}
}
for(const file of files){const path=join(dest,file.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,file.data);}
const manifest={ready:true,sourceHash:createHash('sha256').update(data).digest('hex'),sourceFile:resolve(source),importedAt:new Date().toISOString(),hands:[
 {level:1,mesh:'hand',texture:'hand',flash:'hand'},
 {level:2,mesh:'hand2',texture:'hand2',flash:'hand2'},
 {level:3,mesh:'hand3',texture:'hand3',flash:'hand4'},
 {level:4,mesh:'hand4',texture:'hand5',flash:'hand6'}
],files:files.map(f=>({path:f.path,sha256:createHash('sha256').update(f.data).digest('hex')}))};
if(process.argv[3]){const particles=await readFile(process.argv[3]);const definitions=decodeParticles(particles);await copyFile(process.argv[3],join(dest,'particle.bin'));await writeFile(join(dest,'emitters.json'),JSON.stringify(definitions,null,2)+'\n');manifest.particleDefinition='particle.bin';}
await writeFile(join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Imported ${files.length} original rendering assets into ${dest}`);
