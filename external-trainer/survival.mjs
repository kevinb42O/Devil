// Serialized into the managed page. Keep the factory self-contained.
export function createSurvivalAssist(access, arena, environment=globalThis) {
  let config={},world=null,player=null,original=null,wrapped=null,enabled=false,lastPlanTick=-Infinity,lastPlan=null;
  let hazards=[],byEnemy=new Map(),history=new Map(),historyTime=-1,lastDirection=null;
  let status={active:false,reason:'Ready',available:false};
  const now=()=>environment.performance.now();
  let heartbeat=-Infinity;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const copy=p=>({x:p.x,y:p.y,z:p.z});
  const floor=(x,z,time)=>{
    let height=-1000;
    for(const dx of [-.18,.18])for(const dz of [-.18,.18]){
      const ix=Math.floor((x+dx)/2.48+25.5),iz=Math.floor((z+dz)/2.48+25.5),h=arena.header;
      if(ix<0||iz<0||ix>=h.arenaDimension||iz>=h.arenaDimension)continue;
      const dist=Math.hypot(ix-25,iz-25)*4;
      const threshold=dist<=h.shrinkEnd?Infinity:Math.max(0,(h.shrinkStart-dist)/h.shrinkRate);
      height=Math.max(height,(arena.heights[iz*h.arenaDimension+ix]-Math.max(0,time-threshold)/4)*.62);
    }
    return height;
  };
  // Earliest intersection of a moving sphere and the player's vertical capsule.
  function contact(a,b,r,height=0){
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,loY=-1.35-height,hiY=0,cuts=[0,1];
    if(Math.abs(dy)>1e-9)for(const y of [loY,hiY]){const t=(y-a.y)/dy;if(t>0&&t<1)cuts.push(t);}
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
      const lo=cuts[i-1],hi=cuts[i],mid=a.y+dy*(lo+hi)/2;
      const cap=mid<loY?loY:mid>hiY?hiY:null,oy=cap===null?0:a.y-cap,vy=cap===null?0:dy;
      const aa=dx*dx+vy*vy+dz*dz,bb=2*(a.x*dx+oy*vy+a.z*dz),cc=a.x*a.x+oy*oy+a.z*a.z-(r+.35)**2;
      if(aa*lo*lo+bb*lo+cc<=0)return lo;
      if(aa<1e-12)continue;
      const disc=bb*bb-4*aa*cc;
      if(disc>=0){const t=(-bb-Math.sqrt(disc))/(2*aa);if(t>=lo&&t<=hi)return t;}
    }
    return Infinity;
  }
  function sample(w){
    const next=new Map(),dt=w.time-historyTime;hazards=[];byEnemy=new Map();
    for(const e of w.enemies){
      if(e.hp<=0||(w.active&&!w.active(e)))continue;
      const tower=e.kind.startsWith('squid'),base=tower?Math.min(e.pos.y,Math.max(0,floor(e.pos.x,e.pos.z,w.time))):e.pos.y;
      const spheres=[{pos:{...e.pos,y:base},radius:e.radius,height:tower?e.pos.y-base:e.kind==='thorn'?7:0,key:e.id+':body'}];
      for(let i=0;i<(e.segments?.length||0);i++)spheres.push({pos:e.segments[i].pos,radius:Math.max(e.size*.8,.45),height:0,key:e.id+':'+i});
      for(const s of spheres){
        if(!s.pos||!Number.isFinite(s.pos.x+s.pos.y+s.pos.z+s.radius))continue;
        const before=history.get(s.key);let vel=e.vel||{x:0,y:0,z:0};
        if(before&&dt>1e-5&&dt<.2){const measured={x:(s.pos.x-before.x)/dt,y:(s.pos.y-before.y)/dt,z:(s.pos.z-before.z)/dt};if(Math.hypot(measured.x,measured.y,measured.z)<120)vel=measured;}
        next.set(s.key,copy(s.pos));
        const hazard={...s,pos:copy(s.pos),vel:copy(vel),enemy:e.id};hazards.push(hazard);
        if(!byEnemy.has(e.id))byEnemy.set(e.id,[]);byEnemy.get(e.id).push(hazard);
      }
    }
    if(dt>1e-5||dt<0){history=next;historyTime=w.time;}
  }
  const relative=(h,p,t)=>({x:h.pos.x+h.vel.x*t-p.x,y:h.pos.y+h.vel.y*t-p.y,z:h.pos.z+h.vel.z*t-p.z});
  function threat(e){
    if(!player)return Infinity;
    const p=player.pos,v=player.vel||{x:0,y:0,z:0},horizon=config.dodge_horizon??.75;
    let first=Infinity;
    for(const h of byEnemy.get(e.id)||[]){
      const end={x:p.x+v.x*horizon,y:p.y+v.y*horizon,z:p.z+v.z*horizon};
      first=Math.min(first,contact(relative(h,p,0),relative(h,end,horizon),h.radius,h.height)*horizon);
    }
    return first;
  }
  function rollout(input,dir,relevant,horizon){
    const p=copy(player.pos),v=copy(player.vel),dt=horizon/24,startFloor=floor(p.x,p.z,world.time);
    let grounded=!!player.grounded,firstContact=Infinity,edge=Infinity,clearance=10,jumped=false;
    for(let step=1;step<=24;step++){
      const t=step*dt,before=copy(p),jump=input.jump&&grounded&&!jumped;
      if(grounded&&!jump){const speed=Math.hypot(v.x,v.z),retained=Math.max(0,speed-Math.max(speed,3)*8*dt);if(speed){v.x*=retained/speed;v.z*=retained/speed;}}
      const strength=Math.min(1,Math.hypot(dir.x,dir.z)),wx=strength?dir.x/strength:0,wz=strength?dir.z/strength:0;
      const add=Math.max(0,11*strength-v.x*wx-v.z*wz),accel=Math.min(add,(grounded?100:17)*dt);
      v.x+=wx*accel;v.z+=wz*accel;
      if(jump){v.y=9;grounded=false;jumped=true;}
      const speed=Math.hypot(v.x,v.z);if(speed>18){v.x*=18/speed;v.z*=18/speed;}
      v.y-=26*dt;p.x+=v.x*dt;p.y+=v.y*dt;p.z+=v.z*dt;
      const ground=floor(p.x,p.z,world.time+t),eye=ground+1.7;
      if(config.edge_guard&&ground<Math.max(-3,startFloor-1.2)){edge=Math.min(edge,t);}
      if(p.y<=eye&&before.y>=eye-.2&&v.y<=0){p.y=eye;v.y=0;grounded=true;}else grounded=false;
      if(config.auto_dodge)for(const h of relevant){
        const a=relative(h,before,t-dt),b=relative(h,p,t);
        const hit=contact(a,b,h.radius+.12,h.height);
        if(hit!==Infinity)firstContact=Math.min(firstContact,t-dt+hit*dt);
        const y=b.y>0?b.y:b.y< -1.35-h.height?b.y+1.35+h.height:0;
        clearance=Math.min(clearance,Math.hypot(b.x,y,b.z)-h.radius-.35);
      }
    }
    return {danger:Math.min(firstContact,edge),edge,clearance,cost:(edge<Infinity?4000+(horizon-edge)*1000:0)+(firstContact<Infinity?1000+(horizon-firstContact)*1000:0)};
  }
  function plan(input){
    const horizon=config.dodge_horizon??.75,yaw=input.yaw,len=Math.max(1,Math.hypot(input.forward,input.strafe));
    const manual={x:(-Math.sin(yaw)*input.forward+Math.cos(yaw)*input.strafe)/len,z:(-Math.cos(yaw)*input.forward-Math.sin(yaw)*input.strafe)/len};
    const relevant=hazards.filter(h=>Math.hypot(h.pos.x-player.pos.x,h.pos.z-player.pos.z)<(18+Math.hypot(h.vel.x,h.vel.z))*horizon+h.radius+3);
    const baseline=rollout(input,manual,relevant,horizon);
    if(baseline.danger===Infinity){lastDirection=null;return {dir:null,reason:'Manual movement safe'};}
    const dirs=[manual,{x:0,z:0}];
    for(let i=0;i<16;i++){const a=i*Math.PI/8;dirs.push({x:Math.sin(a),z:Math.cos(a)});}
    let best=null,bestCost=baseline.cost;
    for(const dir of dirs){
      const result=rollout(input,dir,relevant,horizon);
      const alignment=manual.x*dir.x+manual.z*dir.z,continuity=lastDirection?lastDirection.x*dir.x+lastDirection.z*dir.z:0;
      const cost=result.cost+(1-alignment)*.6-continuity*.3-Math.min(3,result.clearance)*.2;
      if(cost<bestCost-.05){bestCost=cost;best={dir,reason:baseline.edge<Infinity?'Edge protection':'Dodging collision'};}
    }
    if(best){lastDirection=best.dir;return best;}
    return {dir:null,reason:'No safer route found'};
  }
  function release(){
    if(world&&world.move===wrapped)world.move=original;
    world=player=original=wrapped=null;status={active:false,available:false,reason:'Stopped'};history.clear();historyTime=-1;lastPlanTick=-Infinity;lastPlan=null;lastDirection=null;
  }
  function sync(state,options,allowed){
    config=options;enabled=allowed;heartbeat=now();
    const w=state.world;
    if(w!==world){release();world=w;}
    player=w?.player;
    status={...status,available:typeof w?.move==='function',...(!allowed?{active:false,reason:'Suspended'}:{})};
    if(!w||typeof w.move!=='function')return;
    if(!original){
      original=w.move;
      wrapped=function(input,dt,...rest){
        let selected=input;
        try{
          const current=access.get();
          if(enabled&&!this.prediction&&now()-heartbeat<150&&current.focused!==false&&current.mode==='playing'&&!current.entrance&&!current.courtyard&&!current.spectating&&this.state==='playing'&&this.player===player&&(config.auto_dodge||config.edge_guard)){
            if(this.tick<lastPlanTick||this.tick-lastPlanTick>=4||!lastPlan){sample(this);lastPlan=plan(input);lastPlanTick=this.tick;}
            if(lastPlan.dir){
              const {x,z}=lastPlan.dir,yaw=input.yaw;
              selected={...input,forward:-Math.sin(yaw)*x-Math.cos(yaw)*z,strafe:Math.cos(yaw)*x-Math.sin(yaw)*z};
            }
            status={available:true,active:!!lastPlan.dir,reason:lastPlan.reason};
          }else {lastPlan=null;status={available:true,active:false,reason:'Suspended'};}
        }catch(error){enabled=false;status={available:true,active:false,reason:'Survival assist fault: '+String(error.message||error)};}
        return original.call(this,selected,dt,...rest);
      };
      w.move=wrapped;
    }
    sample(w);
  }
  return {sync,threat,floor,snapshot:()=>({...status}),stop:release};
}
