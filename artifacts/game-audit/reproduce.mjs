// Run from the project root: node --import tsx artifacts/game-audit/reproduce.mjs
// These checks verify the repaired bugs; they do not modify the game or services.
import assert from 'node:assert/strict';
import {World, idleInput, v} from '../../src/simulation.ts';
import {Sound} from '../../src/audio.ts';
import {tileHeight, TILE_SIZE, floorHeight} from '../../src/arena.ts';

const results = {};
{
  const w = new World(1, {schedule:false});
  w.addCrew('host'); w.selectCrew('host');
  const killer = w.spawn('skull', {...w.player.pos}); killer.age = 2;
  const c = w.spawn('centipede', v(20,6,0));
  Object.assign(c, {age:10, activeAt:3, status:'hunting', pos:v(20,6,0), vel:v(-8,0,0), nextMove:6, statusUntil:30});
  let error;
  try { w.stepCrew(new Map([['host', idleInput()]])); } catch(e) { error = String(e); }
  assert.equal(error, undefined);
  assert.equal(w.crew[0].alive, false);
  assert.equal(w.state, 'dead');
  results.crewWipe = {error, state:w.state, alive:w.crew[0].alive};
}
{
  const w = new World(1, {schedule:false});
  w.addCrew('host'); w.addCrew('guest'); w.selectCrew('host');
  const audio = new Sound(); let clears = 0;
  audio.clear = () => clears++;
  audio.play({kind:'death', shooterId:'guest', pos:v(20,1.7,0)}, w);
  assert.equal(clears, 0); assert.equal(w.crew[0].alive, true);
  results.remoteDeathAudio = {clearsAllAudio:clears !== 0, localAlive:w.crew[0].alive};
}
{
  let pair;
  for(let x=20;x<30&&!pair;x++) for(let z=20;z<30;z++) {
    const high=tileHeight(x,z,0), low=tileHeight(x+1,z,0);
    if(high-low>.01) {pair={x,z,high,low}; break;}
  }
  assert.ok(pair);
  const {x,z,high}=pair, boundary=(x-25+.5)*TILE_SIZE;
  const start=boundary-.55, zz=(z-25)*TILE_SIZE;
  const w = new World(1, {schedule:false});
  w.projectiles=[{id:999,pos:v(start,high+.0801,zz),vel:v(70,-.1,0),age:0,homing:false,level:1}];
  w.step(idleInput());
  // The game's .08 m floor collision clearance is crossed after .001 s,
  // still .48 m before this path leaves the higher tile.
  assert.ok(start+70*.001 < boundary);
  assert.equal(w.projectiles[0].floorBounces ?? 0, 1);
  assert.equal(w.effects.some(e=>e.kind==='ricochet'), true);
  results.floorSweep = {pair, floorContactX:start+70*.001, boundaryX:boundary,
    endpointFloor:floorHeight(w.projectiles[0].pos.x,zz,0,0), missedRicochet:false};
}
console.log(JSON.stringify(results,null,2));
