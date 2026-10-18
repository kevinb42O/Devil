const ease=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
export const CATHEDRAL_OPENINGS=7;
export function cathedralAt(time:number){const t=Number.isFinite(time)?Math.max(0,time):0;return {presence:ease((t-356)/24)*(1-ease((t-454)/28)),light:ease((t-362)/18)*(1-ease((t-440)/32)),closure:ease((t-440)/32),rise:ease((t-356)/126)*12,crown:ease((t-454)/18)};}
/** Same seven world-space apertures for floor illumination, volumetrics and dust. */
export const CATHEDRAL_LIGHT_GLSL=`
float cathedralShaft(vec3 p,float closure){
 float illumination=0.;
 for(int i=0;i<7;i++){
  float angle=float(i)*.897597901+.22;vec2 outward=vec2(cos(angle),sin(angle)),tangent=vec2(-outward.y,outward.x);
  vec2 delta=p.xz-outward*(12.+p.y*.95);
  float across=dot(delta,tangent)/(2.8*(1.-closure*.70));
  float along=dot(delta,outward)/16.;
  float beam=exp(-pow(abs(across),4.)*.9-along*along*1.5);
  beam*=.48+.52*smoothstep(.10,.27,abs(across));
  illumination+=beam;
 }
 return min(1.,illumination);
}`;
