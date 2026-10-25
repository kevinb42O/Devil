// Serialized into the managed page; keep this factory self-contained.
export function createGodmode(access, environment=globalThis) {
  let world=null,player=null,original=null,wrapped=null,safe=null,heartbeat=-Infinity,enabled=false;
  const now=()=>environment.performance.now();
  const eligible=state=>!!state.world&&state.mode==='playing'&&!state.entrance&&!state.courtyard&&!state.spectating&&state.world.state==='playing';
  const active=()=>enabled&&now()-heartbeat<500&&world?.state==='playing';
  function stop(){
    if(world&&world.die===wrapped)world.die=original;
    world=player=original=wrapped=safe=null;enabled=false;
  }
  function sync(state,options,fresh){
    if(state.world!==world){stop();world=state.world;}
    enabled=!!options.godmode&&fresh&&eligible(state);heartbeat=now();
    if(!enabled){stop();return;}
    if(state.world.player!==player){player=state.world.player;safe=null;}
    const pos=player.pos,ground=access.survival.floor(pos.x,pos.z,world.time);
    if(ground>=-3&&pos.y>=ground+1.5&&pos.y<ground+4)safe={x:pos.x,z:pos.z};
    if(!original&&typeof world.die==='function'){
      original=world.die;
      wrapped=function(cause,...rest){
        const state=access.get();
        // Crew simulation switches world.player for each member. Only protect
        // the local player, and leave guest prediction to its authoritative host.
        if(this===world&&this.player===player&&!this.prediction&&active()&&eligible(state)){
          if(cause==='FALLEN'){
            const point=safe&&access.survival.floor(safe.x,safe.z,this.time)>=-3?safe:{x:0,z:0};
            Object.assign(player.pos,{...point,y:access.survival.floor(point.x,point.z,this.time)+1.7});
            Object.assign(player.vel,{x:0,y:0,z:0});player.grounded=true;
          }
          return;
        }
        return original.call(this,cause,...rest);
      };
      world.die=wrapped;
    }
  }
  return {sync,stop,snapshot:()=>({active:active()&&!!wrapped})};
}
