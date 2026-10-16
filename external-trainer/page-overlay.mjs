// Runs in the managed game page. A canvas with pointer-events:none never captures
// clicks, keyboard focus, scrolling or pointer lock, including over its painted HUD.
export function paintPageOverlay({state,options,rect}){
  let canvas=document.getElementById('__abyssTrainerOverlay');
  if(!canvas){
    canvas=document.createElement('canvas');canvas.id='__abyssTrainerOverlay';
    canvas.setAttribute('aria-hidden','true');canvas.inert=true;
    canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none!important;z-index:2147483647;';
    document.body.append(canvas);
  }
  const ratio=devicePixelRatio||1;
  if(canvas.width!==Math.round(innerWidth*ratio)||canvas.height!==Math.round(innerHeight*ratio)){
    canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio);
  }
  const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);
  if(options.esp_enabled!==false&&state.focused){
    ctx.save();ctx.translate(rect.left,rect.top);ctx.beginPath();ctx.rect(0,0,rect.width,rect.height);ctx.clip();
    const scale=options.esp_scale||1;
    if(options.esp_fov){
      const fov=options.fov??360,wide=fov>=170;
      // Rear-facing directions cannot be projected as a perspective circle. Use
      // a labeled screen-space indicator for wide cones instead of hiding it.
      const radius=wide?Math.max(12,Math.min(rect.width,rect.height)/2-28):rect.height/2*Math.tan(fov*Math.PI/360)/Math.tan((state.cameraFov||90)*Math.PI/360);
      ctx.strokeStyle=ctx.fillStyle=options.color_selected||'#66E2DD';ctx.globalAlpha=(options.esp_opacity??.9)*.65;ctx.lineWidth=1.5;
      if(wide)ctx.setLineDash([6,5]);
      ctx.beginPath();ctx.arc(rect.width/2,rect.height/2,radius,0,Math.PI*2);ctx.stroke();
      ctx.setLineDash([]);
      ctx.font='11px sans-serif';ctx.textAlign='center';
      ctx.fillText(`${fov}°${fov===360?' / ALL DIRECTIONS':wide?' / WIDE CONE':''}`,rect.width/2,Math.max(16,rect.height/2-radius-8));ctx.textAlign='left';
    }
    const labeled=new Set(),arrows=new Set();
    for(const item of state.candidates||[]){
      const selected=item.id===state.target?.id;
      ctx.strokeStyle=ctx.fillStyle=selected?options.color_selected||'#66E2DD':item.category==='tower'?options.color_tower||'#F2AC66':options.color_enemy||'#8FAABB';
      ctx.globalAlpha=(options.esp_opacity??.9)*(item.aimable?1:.45);ctx.lineWidth=selected?2:1;
      if(item.box){
        const [x,y,w,h]=item.box;
        if(options.esp_boxes!==false){
          if(options.esp_style==='corners'){
            const length=Math.max(3,Math.min(14*scale,w*.28,h*.28));
            ctx.beginPath();
            for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){
              ctx.moveTo(cx+sx*length,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+sy*length);
            }
            ctx.stroke();
          }else ctx.strokeRect(x,y,w,h);
        }
        if(options.esp_health!==false){
          const fraction=Math.max(0,Math.min(1,item.health/Math.max(.001,item.maxHealth)));
          ctx.fillRect(x,y+h+3,w*fraction,3);
        }
        if(!labeled.has(item.enemy)||selected){
          const parts=[];
          if(options.esp_labels!==false)parts.push(item.label||item.kind);
          if(options.esp_distance!==false)parts.push(`${(item.distance||0).toFixed(1)} u`);
          if(parts.length){ctx.font=`${10*scale}px sans-serif`;ctx.fillText(parts.join(' / '),x,Math.max(12,y-5));}
          labeled.add(item.enemy);
        }
        if(selected&&options.esp_lines!==false){ctx.beginPath();ctx.moveTo(rect.width/2,rect.height/2);ctx.lineTo(item.x,item.y);ctx.stroke();}
        if(selected&&options.esp_prediction!==false&&item.lead?.box){
          const {x:lx,y:ly}=item.lead;ctx.beginPath();ctx.moveTo(lx-4,ly);ctx.lineTo(lx+4,ly);ctx.moveTo(lx,ly-4);ctx.lineTo(lx,ly+4);ctx.stroke();
        }
      }else if(item.arrow&&options.esp_arrows!==false&&(!arrows.has(item.enemy)||selected)){
        ctx.save();ctx.translate(item.arrow.x,item.arrow.y);ctx.rotate(item.arrow.angle);ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-6,-5);ctx.lineTo(-6,5);ctx.closePath();ctx.fill();ctx.restore();
        arrows.add(item.enemy);
      }
    }
    ctx.restore();
  }
  if(options.hud_enabled!==false){
    const width=Math.min(innerWidth-32,options.hud_compact===false?520:390),height=options.hud_compact===false?90:54;
    const anchor=options.hud_anchor||'top_left';
    const x=anchor.endsWith('right')?innerWidth-width-16:16,y=anchor.startsWith('bottom')?innerHeight-height-16:16;
    ctx.globalAlpha=1;ctx.fillStyle='#101519';ctx.fillRect(x,y,width,height);
    ctx.fillStyle='#66E2DD';ctx.font='bold 12px sans-serif';
    ctx.fillText(`ABYSS / ${state.active?'LOCKED':options.enabled?'AIM ON':'AIM OFF'} / ${options.profile||'Precision'}`,x+12,y+21);
    ctx.fillStyle='#d9e3ec';ctx.font='11px sans-serif';ctx.fillText('F7 settings  F8 aim  F4 ESP  F3 HUD  F10 quit',x+12,y+41);
    if(options.hud_compact===false){
      ctx.fillText(state.target?`${state.target.label||state.target.kind} / HP ${Math.round(state.target.health)} / ${(state.target.distance||0).toFixed(1)} u`:state.message||'Ready',x+12,y+61);
      ctx.fillText(`${state.targets||0} targets / ${(state.averageMs||0).toFixed(2)} ms / ${state.aimApplications||0} aim updates`,x+12,y+79);
    }
  }
  clearTimeout(globalThis.__abyssOverlayTimeout);
  globalThis.__abyssOverlayTimeout=setTimeout(()=>canvas.remove(),1500);
}
