import { defineConfig } from 'vite';
import {buildPwa} from './tools/build-pwa.mjs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
// Keep provenance/source downloads out of the shipped game; include runtime assets.
export default defineConfig({
  server:{host:'127.0.0.1',port:5173,strictPort:true},
  preview:{host:'127.0.0.1',port:4173,strictPort:true},
  build:{target:'es2022',chunkSizeWarningLimit:700},
  plugins:[{name:'game-assets',async closeBundle(){
    await mkdir('dist/assets/audio',{recursive:true});await mkdir('dist/assets/materials/rock_tile_floor/2k/textures',{recursive:true});
    for(const file of ['rock_tile_floor_diff_2k.jpg','rock_tile_floor_nor_gl_2k.jpg','rock_tile_floor_rough_2k.png'])await cp(`assets/materials/rock_tile_floor/2k/textures/${file}`,`dist/assets/materials/rock_tile_floor/2k/textures/${file}`);
    await cp('assets/licenses','dist/assets/licenses',{recursive:true});
    await cp('node_modules/@fontsource/barlow-condensed/LICENSE','dist/assets/licenses/barlow-condensed-OFL.txt');
    await cp('node_modules/@fontsource/dm-sans/LICENSE','dist/assets/licenses/dm-sans-OFL.txt');
    await cp('node_modules/meshoptimizer/LICENSE.md','dist/assets/licenses/meshoptimizer-MIT.txt');
    // The user explicitly retained the current bullets. Do not package the
    // removed hand/enemy/floor/gore assets alongside this narrow exception.
    const retained='dist/assets/original/devil-daggers';
    await mkdir(retained+'/meshes',{recursive:true});await mkdir(retained+'/textures',{recursive:true});
    const projectileMeshes=['dagger',...Array.from({length:8},(_,i)=>`flame${i+1}`),...Array.from({length:3},(_,i)=>`ember${i+1}`)];
    const projectileTextures=['dagger','dagger2','dagger3','dagger4','dagger5','dagger6','emberflame'];
    for(const name of projectileMeshes)await cp(`assets/original/devil-daggers/meshes/${name}.obj`,`${retained}/meshes/${name}.obj`);
    for(const name of projectileTextures)await cp(`assets/original/devil-daggers/textures/${name}.png`,`${retained}/textures/${name}.png`);
    await cp('assets/original/devil-daggers/emitters.json',retained+'/emitters.json');
    await writeFile(retained+'/manifest.json',JSON.stringify({ready:true,scope:'Retained projectile visuals only; audio uses CC0 replacements',owner:'Sorath',reuseLicenseFound:false,meshes:projectileMeshes,textures:projectileTextures}));
    await buildPwa();
  }}]
});
