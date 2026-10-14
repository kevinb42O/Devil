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
 // The sound archive is large. Cache it only on an explicit offline download,
 // or as sounds are used. Meshes, textures and the app shell install together.
 const core=shipped.filter(path=>!path.startsWith('/assets/original/devil-daggers/audio/')&&!path.startsWith('/assets/materials/')&&!path.startsWith('/assets/audio/'));
 const audio=shipped.filter(path=>path.startsWith('/assets/original/devil-daggers/audio/')&&/\.(wav|ini)$/.test(path));
 const offline=[...core,...audio];
 const bytes=(await Promise.all(offline.map(path=>stat(root+path)))).reduce((sum,info)=>sum+info.size,0);
 await writeFile(`${root}/offline-pack.json`,JSON.stringify({version,bytes,files:offline}));
 const template=await readFile(new URL('./pwa-worker.js',import.meta.url),'utf8');
 await writeFile(`${root}/sw.js`,template.replace('__VERSION__',JSON.stringify(version)).replace('__CORE__',JSON.stringify([...core,'/offline-pack.json'])));
}
