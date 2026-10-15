// Browser CSS coordinates -> desktop points. Page zoom changes devicePixelRatio;
// macOS display backing scale provides the independent Retina factor.
export function viewportGeometry(view, displays=[]){
  const centerX=view.screenX+view.outerWidth/2,centerY=view.screenY+view.outerHeight/2;
  const display=displays.find(d=>centerX>=d.left&&centerX<d.left+d.width&&centerY>=d.top&&centerY<d.top+d.height);
  const scale=display?.scale||view.devicePixelRatio||1;
  const zoom=Math.max(.25,Math.min(5,(view.devicePixelRatio||scale)/scale));
  const border=Math.max(0,(view.outerWidth-view.innerWidth*zoom)/2);
  return {zoom,region:{left:view.screenX+border+view.rect.left*zoom,
    top:view.screenY+Math.max(0,view.outerHeight-view.innerHeight*zoom-border)+view.rect.top*zoom,
    width:view.rect.width*zoom,height:view.rect.height*zoom}};
}

export function desktopTelemetry(data,displays=[]){
  if(!data.viewport)return data;
  const {zoom,region}=viewportGeometry(data.viewport,displays);
  const scale=p=>p?{...p,...(Number.isFinite(p.x)?{x:p.x*zoom,y:p.y*zoom}:{}),
    box:p.box?.map(v=>v*zoom)||null,
    ...(p.arrow?{arrow:{...p.arrow,x:p.arrow.x*zoom,y:p.arrow.y*zoom}}:{}),
    ...(p.lead?{lead:scale(p.lead)}:{})}:null;
  const {viewport,...rest}=data;
  return {...rest,region,zoom,target:scale(data.target),candidates:(data.candidates||[]).map(scale)};
}
