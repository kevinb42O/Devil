import { defineConfig } from 'vite';
import { cp, mkdir, access } from 'node:fs/promises';
// Keep provenance/source downloads out of the shipped game; copy only used CC0 assets.
export default defineConfig({
  server:{host:'127.0.0.1',port:5173},
  build:{target:'es2022',chunkSizeWarningLimit:700},
  plugins:[{name:'game-assets',async closeBundle(){
    await mkdir('dist/assets/audio',{recursive:true});await mkdir('dist/assets/materials/rock_tile_floor/2k/textures',{recursive:true});
    await cp('assets/audio/selected','dist/assets/audio/selected',{recursive:true});
    for(const file of ['rock_tile_floor_diff_2k.jpg','rock_tile_floor_nor_gl_2k.jpg','rock_tile_floor_rough_2k.png'])await cp(`assets/materials/rock_tile_floor/2k/textures/${file}`,`dist/assets/materials/rock_tile_floor/2k/textures/${file}`);
    await cp('assets/licenses','dist/assets/licenses',{recursive:true});
    await cp('node_modules/@fontsource/barlow-condensed/LICENSE','dist/assets/licenses/barlow-condensed-OFL.txt');
    await cp('node_modules/@fontsource/dm-sans/LICENSE','dist/assets/licenses/dm-sans-OFL.txt');
    try {await access('assets/original/devil-daggers/manifest.json');await cp('assets/original/devil-daggers','dist/assets/original/devil-daggers',{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  }}]
});
