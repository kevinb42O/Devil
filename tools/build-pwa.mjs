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
 // Cache the actual active catalog, including retained dry/wet footsteps.
 const original=JSON.parse(await readFile(`${root}/assets/audio/original/manifest.json`,'utf8'));
 const retainedSteps=JSON.parse(await readFile(`${root}/assets/audio/remake/manifest.json`,'utf8'));
 const openingNames=['highscore1','daggerhit1','gibdrone1','gibdrone2','gibdrone3','rapid1','shot1','gibcollect','gibcollectmagic','jump1','jump2','jump3','land','land2','death','fall','spawnminisquid','football-goal','crew-countdown','uihover','uiclick','uislider','menuatmos'];
 const openingAudio=new Set(openingNames.map(name=>`/assets/audio/original/${original.cues[name].file}`));
 const footsteps=new Set(Object.values(retainedSteps).filter(asset=>asset.role==='footstep').map(asset=>`/assets/audio/remake/${asset.file}`));
 const core=shipped.filter(path=>!path.startsWith('/assets/materials/')&&(!path.startsWith('/assets/audio/')||openingAudio.has(path)||footsteps.has(path)||path.endsWith('/manifest.json')||path.endsWith('/LICENSE.md')));
 const audio=shipped.filter(path=>(path.startsWith('/assets/audio/original/')||path.startsWith('/assets/audio/environment/'))&&/\.(wav|m4a)$/.test(path)&&!core.includes(path));
 const offline=[...core,...audio];
 const bytes=(await Promise.all(offline.map(path=>stat(root+path)))).reduce((sum,info)=>sum+info.size,0);
 await writeFile(`${root}/offline-pack.json`,JSON.stringify({version,bytes,files:offline}));
 const template=await readFile(new URL('./pwa-worker.js',import.meta.url),'utf8');
 await writeFile(`${root}/sw.js`,template.replace('__VERSION__',JSON.stringify(version)).replace('__CORE__',JSON.stringify([...core,'/offline-pack.json'])));
}
