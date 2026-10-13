/** Mobile stays in landscape even where the browser cannot lock orientation. */
export function gameViewport(width=innerWidth,height=innerHeight,mobile=document.body.dataset.controls==='mobile'){
 const rotated=mobile&&height>width;
 return {width:rotated?height:width,height:rotated?width:height,rotated};
}
export function gamePoint(x:number,y:number,viewport=gameViewport()){
 return viewport.rotated?{x:y,y:viewport.height-x}:{x,y};
}
