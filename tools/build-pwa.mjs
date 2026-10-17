import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Called after Vite copies runtime assets. Each release owns an immutable cache;
// a fully downloaded update activates immediately, and reload uses the latest release.
export async function buildPwa(root='dist'){
 const files=[];
 async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=`${dir}/${entry.name}`;
  if(entry.isDirectory())await walk(path);else files.push(path.slice(root.length));
 }}
 await walk(root);
 const shipped=files.filter(path=>!['/sw.js','/offline-pack.json'].includes(path));
 const hash=createHash('sha256');
 for(const path of shipped.sort()){hash.update(path);hash.update(await readFile(root+path));}
 const version=hash.digest('hex').slice(0,16);
 // Opening effects and the courtyard goal cue work on the first offline run.
 // Cache the full replacement catalog on explicit download or as cues are used.
 const openingAudio=['rapid1','shot1','shot1alt1','shot1alt2','shot1alt3','shot1alt4','weapon1-start','weapon1-stop','gibcollect','jump1','jump2','jump3','land','land2','death','fall','spawnminisquid','football-goal','crew-countdown','uihover','uiclick','uislider'].map(name=>`/assets/audio/remake/${name}.wav`);
 const core=shipped.filter(path=>!path.startsWith('/assets/materials/')&&(!path.startsWith('/assets/audio/')||path.startsWith('/assets/audio/menu/')||openingAudio.includes(path)||path.endsWith('/manifest.json')||path.endsWith('/LICENSE.md')));
 const audio=shipped.filter(path=>path.startsWith('/assets/audio/remake/')&&/\.(wav|m4a)$/.test(path)&&!core.includes(path));
 const offline=[...core,...audio];
 const bytes=(await Promise.all(offline.map(path=>stat(root+path)))).reduce((sum,info)=>sum+info.size,0);
 await writeFile(`${root}/offline-pack.json`,JSON.stringify({version,bytes,files:offline}));
 const template=await readFile(new URL('./pwa-worker.js',import.meta.url),'utf8');
 await writeFile(`${root}/sw.js`,template.replace('__VERSION__',JSON.stringify(version)).replace('__CORE__',JSON.stringify([...core,'/offline-pack.json'])));
}
