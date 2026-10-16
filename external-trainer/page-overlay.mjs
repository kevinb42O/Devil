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
    for(const item of state.candidates||[]){
      const selected=item.id===state.target?.id;
      ctx.strokeStyle=ctx.fillStyle=selected?options.color_selected||'#66E2DD':item.category==='tower'?options.color_tower||'#F2AC66':options.color_enemy||'#8FAABB';
      ctx.globalAlpha=(options.esp_opacity??.9)*(item.aimable?1:.45);ctx.lineWidth=selected?2:1;
      if(item.box){
        const [x,y,w,h]=item.box;
        if(options.esp_boxes!==false)ctx.strokeRect(x,y,w,h);
        if(options.esp_health!==false){
          const fraction=Math.max(0,Math.min(1,item.health/Math.max(.001,item.maxHealth)));
          ctx.fillRect(x,y+h+3,w*fraction,3);
        }
        if(options.esp_labels!==false){ctx.font=`${10*(options.esp_scale||1)}px sans-serif`;ctx.fillText(item.label||item.kind,x,Math.max(12,y-5));}
        if(selected&&options.esp_lines!==false){ctx.beginPath();ctx.moveTo(rect.width/2,rect.height/2);ctx.lineTo(item.x,item.y);ctx.stroke();}
      }else if(item.arrow&&options.esp_arrows!==false){
        ctx.save();ctx.translate(item.arrow.x,item.arrow.y);ctx.rotate(item.arrow.angle);ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-6,-5);ctx.lineTo(-6,5);ctx.closePath();ctx.fill();ctx.restore();
      }
    }
    ctx.restore();
  }
  if(options.hud_enabled!==false){
    ctx.globalAlpha=1;ctx.fillStyle='#101519';ctx.fillRect(16,16,390,54);
    ctx.fillStyle='#66E2DD';ctx.font='bold 12px sans-serif';
    ctx.fillText(`ABYSS / ${state.active?'LOCKED':options.enabled?'AIM ON':'AIM OFF'} / ${options.profile||'Precision'}`,28,37);
    ctx.fillStyle='#d9e3ec';ctx.font='11px sans-serif';ctx.fillText('F7 settings  F8 aim  F4 ESP  F3 HUD  F10 quit',28,57);
  }
  clearTimeout(globalThis.__abyssOverlayTimeout);
  globalThis.__abyssOverlayTimeout=setTimeout(()=>canvas.remove(),1500);
}
