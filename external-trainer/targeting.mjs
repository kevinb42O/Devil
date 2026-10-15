// This factory is serialized into the inspected session. Keep it self-contained.
export function createMemoryAim(access, environment = globalThis) {
  const clock=()=>environment.performance.now(), originalRAF=environment.requestAnimationFrame;
  const config={prediction:true,aim_mode:'snap',smooth_speed:720,fov:360,max_distance:196,
    selection:'nearest',tower_priority:true,switch_bias:8,lock_ms:120,lead_limit:1.5,
    excluded_kinds:'',esp_enabled:true,esp_max_targets:120,...access.config};
  let enabled=false,requestedEnabled=false,suspended=false,heartbeat=clock(),stopped=false,fault=null;
  let physical=0,selectedId=null,selectedAt=0,previous=new Map(),lastTime=-1,lastWorld=null,lastAimAt=null;
  let aimApplications=0,lastApplied=null,lastCost=0,entries=[],chosen=null;
  let telemetry={targets:0,candidates:[],target:null,active:false,message:'Memory attached'};
  const copy=p=>({x:p.x,y:p.y,z:p.z}), clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
  const kindLabel=k=>({squid:'TOWER I',squid2:'TOWER II',squid3:'TOWER III',spider:'SPIDER I',spider2:'SPIDER II',
    skull:'SKULL I',skull2:'SKULL II',skull3:'SKULL III',skull4:'SKULL IV',
    transmuted1:'TRANSMUTED I',transmuted2:'TRANSMUTED II',transmuted3:'TRANSMUTED III',transmuted4:'TRANSMUTED IV',
    egg:'EGG I',egg2:'EGG II',centipede:'CENTIPEDE',gigapede:'GIGAPEDE',ghostpede:'GHOSTPEDE',leviathan:'LEVIATHAN',orb:'ORB'}[k]||k.toUpperCase());

  function intercept(origin,point,velocity,speed){
    const x=point.x-origin.x,y=point.y-origin.y,z=point.z-origin.z;
    const a=velocity.x**2+velocity.y**2+velocity.z**2-speed**2;
    const b=2*(x*velocity.x+y*velocity.y+z*velocity.z),c=x*x+y*y+z*z;
    let t=0;
    if(Math.abs(a)<1e-8)t=b<0?-c/b:0;
    else {const disc=b*b-4*a*c;if(disc>=0){const roots=[(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)].filter(v=>v>0);if(roots.length)t=Math.min(...roots);}}
    t=clamp(t,0,Math.min(config.lead_limit,speed===42?8:2.8));
    return {x:point.x+velocity.x*t,y:point.y+velocity.y*t,z:point.z+velocity.z*t};
  }

  function projected(point){
    if(!point)return null;
    try{return {...point,...access.project?.(point.pos,point.radius)};}
    catch{return {...point,box:null};} // An ESP failure must never interrupt aiming/gameplay.
  }
  function snapshot(){
    const ordered=config.esp_enabled?entries.slice().sort((a,b)=>(b.id===selectedId)-(a.id===selectedId)||a.priority-b.priority||a.distance-b.distance):[];
    const candidates=ordered.slice(0,config.esp_max_targets).map(projected);
    const target=chosen?(candidates.find(p=>p.id===chosen.id)||projected(chosen)):null;
    if(target&&access.project){try{target.lead=access.project(chosen.predicted,0);}catch{}}
    return {...telemetry,target,candidates,espTargets:entries.length};
  }

  function compute(forceFiring=false){
    const started=clock(),state=access.get(),w=state.world,focus=state.focused!==false;
    const running=!!w&&state.mode==='playing'&&!state.entrance&&!state.courtyard&&!state.spectating&&w.state==='playing';
    const secondary=state.canHoming!==false&&(!!state.homing||!!(physical&2));
    const firing=!!((physical&1)||state.fire||secondary),fresh=started-heartbeat<500;
    telemetry={targets:0,active:false,focused:focus,aimApplications,lastApplied,firing,cameraFov:state.cameraFov||90,
      message:!w?'Memory connected · start a run':!running?'Waiting for combat':!fresh?'Trainer heartbeat lost':!enabled?'OFF · F8 to enable':firing?'Tracking':'ON · fire either weapon to aim'};
    if(w!==lastWorld||(w&&w.time<lastTime)||!running){previous.clear();lastTime=w?.time??-1;selectedId=null;lastWorld=w;lastAimAt=null;}
    entries=[];chosen=null;
    if(!running){physical=0;return;}
    const origin=w.player.pos,next=new Map(),dt=w.time-lastTime,points=[];
    const excluded=new Set(String(config.excluded_kinds).split(',').map(k=>k.trim()).filter(Boolean));
    const homing=secondary,speed=homing?42:70;
    let enemyActive=true;
    const add=(e,pos,index,tier,radius,health,eligible=true)=>{
      radius=access.radius?access.radius(e,index,radius):radius;
      if(!(radius>0)||!Number.isFinite(pos.x+pos.y+pos.z))return;
      const id=e.id+':'+index,old=previous.get(id);
      let velocity=copy(old?.velocity||e.vel||{x:0,y:0,z:0});
      if(old&&dt>1e-5&&dt<.2){
        const measured={x:(pos.x-old.x)/dt,y:(pos.y-old.y)/dt,z:(pos.z-old.z)/dt};
        if(Math.hypot(measured.x,measured.y,measured.z)<120)velocity=measured;
        else velocity=copy(e.vel||{x:0,y:0,z:0});
      }
      next.set(id,{...copy(pos),velocity});
      const distance=Math.hypot(pos.x-origin.x,pos.y-origin.y,pos.z-origin.z);
      // In distance mode only hittable tower crystals get an elevated tier.
      // Other weak points must never outrank an enemy about to reach the player.
      const priority=config.tower_priority?(config.selection==='nearest'?(tier===0?0:1):tier):0;
      const maxHealth=access.maxHealth?.(e,index)??health;
      const label=kindLabel(e.kind)+(index.startsWith('crystal')?' · CRYSTAL '+(Number(index.slice(7))+1):index.startsWith('segment')?' · SEGMENT '+(Number(index.slice(7))+1):'');
      const entry={id,enemy:e.id,kind:e.kind,priority,category:tier===0?'tower':tier===1?'weak':'enemy',pos:copy(pos),predicted:copy(pos),radius,index,health,maxHealth,distance,label,aimable:false};
      entries.push(entry);
      if(!eligible||!enemyActive||excluded.has(e.kind)||distance>Math.min(config.max_distance,speed===42?336:196))return;
      let aimPoint=pos;
      if(access.resolve){aimPoint=access.resolve(e,pos,radius,state,homing);if(!aimPoint)return;}
      else if(access.visible&&!access.visible(e,pos,radius,state,homing))return;
      let predicted=config.prediction?intercept(origin,aimPoint,velocity,speed):copy(aimPoint);
      // Leading a visible edge can move the firing ray back into tower armor.
      // Validate that ray too; fall back to the already verified damage point.
      if(config.prediction&&access.resolve&&e.weakpoints?.length&&
          !access.resolve(e,pos,radius,state,homing,predicted))predicted=copy(aimPoint);
      if(!Number.isFinite(predicted.x+predicted.y+predicted.z))return;
      const aim={yaw:Math.atan2(origin.x-predicted.x,origin.z-predicted.z),pitch:Math.atan2(predicted.y-origin.y,Math.hypot(predicted.x-origin.x,predicted.z-origin.z))};
      if(Math.abs(aim.pitch)>1.5)return;
      const dy=wrap(aim.yaw-state.yaw);
      const angle=Math.acos(clamp(Math.sin(aim.pitch)*Math.sin(state.pitch)+Math.cos(aim.pitch)*Math.cos(state.pitch)*Math.cos(dy),-1,1));
      if(angle>config.fov*Math.PI/360+1e-9)return;
      const playerVelocity=w.player.vel||{x:0,y:0,z:0};
      const closing=Math.max(2,-((pos.x-origin.x)*(velocity.x-playerVelocity.x)+(pos.y-origin.y)*(velocity.y-playerVelocity.y)+(pos.z-origin.z)*(velocity.z-playerVelocity.z))/Math.max(.001,distance));
      let score=config.selection==='nearest'?distance:config.selection==='health'?health:config.selection==='threat'?Math.max(0,distance-e.radius-.35)/closing:angle;
      const bias=config.switch_bias*Math.PI/180;
      if(id===selectedId&&config.selection!=='nearest')score-=config.selection==='crosshair'?bias:Math.abs(score)*Math.min(.4,bias);
      Object.assign(entry,{predicted,aim,score,angle,aimable:true});points.push(entry);
    };
    for(const e of w.enemies){
      if(e.hp<=0)continue;
      enemyActive=!w.active||w.active(e);
      if(e.weakpoints?.length)e.weakpoints.forEach((weak,index)=>{if(weak.hp>0)add(e,w.weakPoint({...e,weakpoints:[weak]}),'crystal'+index,e.kind.startsWith('squid')?0:1,e.kind==='leviathan'?.6:.63,weak.hp);});
      else if(e.segments?.length)e.segments.forEach((segment,index)=>{if(segment.hp>0)add(e,segment.pos,'segment'+index,1,.53*e.size,segment.hp);});
      else add(e,w.weakPoint(e),'body',e.kind==='spider'||e.kind==='spider2'?1:2,e.radius,e.hp,!(e.kind==='spider'||e.kind==='spider2')||e.headExposure>=.5);
    }
    // Loose pickups (world.gems) are deliberately never candidates or ESP entries.
    previous=next;lastTime=w.time;
    points.sort((a,b)=>a.priority-b.priority||a.score-b.score||a.id.localeCompare(b.id));
    chosen=points[0]||null;
    const locked=points.find(p=>p.id===selectedId);
    if(config.selection!=='nearest'&&locked&&chosen&&locked.priority===chosen.priority&&started-selectedAt<config.lock_ms)chosen=locked;
    if(chosen?.id!==selectedId){selectedAt=started;selectedId=chosen?.id??null;}
    const canAim=enabled&&!fault&&!suspended&&focus&&firing&&fresh;
    if(canAim&&chosen){
      let {yaw,pitch}=chosen.aim;
      if(config.aim_mode==='smooth'){
        const dtAim=lastAimAt===null?1/120:clamp((started-lastAimAt)/1000,0,.05);
        const limit=config.smooth_speed*Math.PI/180*dtAim,dy=wrap(yaw-state.yaw),dp=pitch-state.pitch;
        const length=Math.hypot(dy,dp),scale=length?Math.min(1,limit/length):1;
        yaw=state.yaw+dy*scale;pitch=state.pitch+dp*scale;
      }
      access.set(yaw,clamp(pitch,-1.5,1.5));lastAimAt=started;
      aimApplications++;lastApplied={id:chosen.id,kind:chosen.kind,priority:chosen.priority};telemetry.active=true;
    }else lastAimAt=null;
    lastCost=lastCost*.85+(clock()-started)*.15;
    Object.assign(telemetry,{targets:points.length,aimApplications,lastApplied,tick:w.tick,costMs:clock()-started,averageMs:lastCost});
    if(!chosen&&enabled&&fresh)telemetry.message='No target inside aim limits';
  }
  function run(force=false){
    if(stopped)return;
    try{compute(force);}
    catch(error){fault=String(error?.message||error);enabled=false;physical=0;chosen=null;entries=[];telemetry={...telemetry,active:false,error:true,message:'Aim stopped: '+fault};}
    if(fault){telemetry.error=true;telemetry.message='Aim stopped: '+fault;telemetry.active=false;}
  }
  function wrappedRAF(callback){
    if(typeof callback!=='function')return originalRAF.call(environment,callback);
    return originalRAF.call(environment,timestamp=>{try{run();}finally{callback(timestamp);}});
  }
  const onDown=e=>{if(e.button!==0&&e.button!==2)return;if(e.button===0)physical|=1;else physical|=2;run();};
  const onUp=e=>{if(e.button!==0&&e.button!==2)return;const bit=e.button===0?1:2;if(physical&bit)run(true);physical&=~bit;};
  const resetInput=()=>{physical=0;lastAimAt=null;telemetry.active=false;telemetry.focused=false;entries=[];chosen=null;};
  const handlers={mousedown:onDown,mouseup:onUp,blur:resetInput,pointerlockchange:resetInput,visibilitychange:resetInput};
  for(const [event,handler]of Object.entries(handlers))environment.addEventListener?.(event,handler,true);
  if(originalRAF)environment.requestAnimationFrame=wrappedRAF;
  return {
    step(force=false){run(force);return snapshot();},
    control(options){
      const nextEnabled=!!options.enabled;
      let dirty=nextEnabled!==requestedEnabled||!!options.suspended!==suspended;
      if(nextEnabled&&!requestedEnabled)fault=null;
      requestedEnabled=nextEnabled;
      enabled=nextEnabled;suspended=!!options.suspended;heartbeat=clock();
      for(const key of Object.keys(config))if(key in options&&config[key]!==options[key]){config[key]=options[key];dirty=true;}
      if(dirty||!originalRAF)run();return snapshot();
    },
    snapshot,
    stop(){stopped=true;enabled=false;physical=0;chosen=null;entries=[];if(environment.requestAnimationFrame===wrappedRAF)environment.requestAnimationFrame=originalRAF;for(const [event,handler]of Object.entries(handlers))environment.removeEventListener?.(event,handler,true);telemetry.active=false;}
  };
}
// Find a shootable patch inside the crystal's actual damage sphere. A visible
// edge remains usable when the center is occluded by the rotating tower mesh.
export function resolveDamagePoint(enemy, center, radius, state, homing, helpers, trajectory=null){
  if(center.y+radius<0)return null;
  const world=state.world,origin=world.player.pos;
  // Homing daggers also collide with armor. Check every active tower, including
  // towers whose crystals are already gone, up to the first damage-sphere hit.
  const clear=point=>{
    const t=helpers.segmentSphere(origin,point,center,radius);
    if(t===null)return false;
    for(const blocker of state.armorEnemies||world.enemies){
      if(blocker.hp<=0||(world.active&&!world.active(blocker)))continue;
      if(helpers.armorBounds&&helpers.armorBounds(blocker)===null)continue;
      if(helpers.sweepArmor(blocker,origin,origin,point,t,world.time,world.spawnFixesEnabled))return false;
    }
    return true;
  };
  if(trajectory)return clear(trajectory)?trajectory:null;
  if(clear(center))return center;
  if(!enemy.weakpoints?.length)return null;
  const dx=center.x-origin.x,dy=center.y-origin.y,dz=center.z-origin.z;
  const horizontal=Math.hypot(dx,dz)||1,length=Math.hypot(dx,dy,dz)||1;
  const right={x:-dz/horizontal,y:0,z:dx/horizontal};
  const up={x:-dy*dx/(length*horizontal),y:horizontal/length,z:-dy*dz/(length*horizontal)};
  for(const [side,vertical] of [[.55,0],[-.55,0],[0,.55],[0,-.55],[.4,.4],[-.4,.4],[.4,-.4],[-.4,-.4]]){
    const point={x:center.x+radius*(right.x*side+up.x*vertical),y:center.y+radius*up.y*vertical,z:center.z+radius*(right.z*side+up.z*vertical)};
    if(clear(point))return point;
  }
  return null;
}
