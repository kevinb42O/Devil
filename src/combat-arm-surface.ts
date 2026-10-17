/** Object-space materials stay registered to the bind pose as the rig animates.
 * Shared by all seven tiers; no texture downloads or additional render passes. */
export const COMBAT_ARM_SURFACE = /* glsl */`
float armHash(vec3 p){
 p=fract(p*.3183099+vec3(.17,.31,.73));p*=17.;
 return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float armNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(armHash(i),armHash(i+vec3(1,0,0)),f.x),mix(armHash(i+vec3(0,1,0)),armHash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(armHash(i+vec3(0,0,1)),armHash(i+vec3(1,0,1)),f.x),mix(armHash(i+vec3(0,1,1)),armHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// Distance to the two nearest cells gives irregular, branching plate boundaries.
vec2 armCells(vec3 p){
 vec3 base=floor(p),f=fract(p);float a=8.,b=8.;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
  vec3 cell=vec3(float(x),float(y),float(z));
  vec3 seed=base+cell;
  vec3 delta=cell+vec3(armHash(seed),armHash(seed+19.1),armHash(seed+47.7))-f;
  float d=dot(delta,delta);if(d<a){b=a;a=d;}else b=min(b,d);
 }
 return vec2(sqrt(a),sqrt(b)-sqrt(a));
}
`;

export const COMBAT_ARM_COLOR = /* glsl */`
// One continuous bind-space surface across the skin, with no shoulder seams.
float armMask=combatActive;
float armFeedbackMask=clamp(vCombatArm.y+(combatTier>=5.?vCombatArm.x:0.),0.,1.)*combatActive;
// The source GLB is authored in small units; normalize before sampling.
float armTier=clamp(combatTier,1.,7.);
float armScale=armTier<2.5?1.25:(armTier<4.5?.8:(armTier<6.5?.95:.56));
vec3 armP=vCombatSurface*3200.;
float armCloud=armNoise(armP*.23);
vec3 armWarp=armP+vec3(armCloud,armNoise(armP*.21+9.),armNoise(armP*.19+27.))*2.4;
vec2 armCell=armCells(armWarp*.72*armScale);
float armGrain=armNoise(armP*7.);
float armPores=armNoise(armP*19.);
float armAA=max(fwidth(armCell.y),.003);
float armSeam=1.-smoothstep(.018-armAA,.055+armAA,armCell.y);
float armLip=smoothstep(.035,.085,armCell.y)*(1.-smoothstep(.085,.17,armCell.y));
float armVein=(1.-smoothstep(.008-armAA,.021+armAA,armCell.y))*smoothstep(.23,.66,armNoise(armP*.61+5.));
vec3 armBase=vec3(.105,.036,.029),armEdge=vec3(.24,.105,.066);
float armMetal=.08,armRough=.72,armHeat=.025;
if(armTier>1.5){armBase=vec3(.075,.028,.021);armEdge=vec3(.30,.115,.048);armHeat=.25;armRough=.65;}
if(armTier>2.5){armBase=vec3(.065,.077,.088);armEdge=vec3(.29,.31,.32);armHeat=.45;armMetal=.52;armRough=.46;}
if(armTier>3.5){armBase=vec3(.16,.082,.033);armEdge=vec3(.57,.34,.12);armHeat=.6;armMetal=.72;armRough=.37;}
if(armTier>4.5){armBase=vec3(.042,.025,.038);armEdge=vec3(.24,.085,.11);armHeat=.8;armMetal=.48;armRough=.40;}
if(armTier>5.5){armBase=vec3(.10,.035,.09);armEdge=vec3(.40,.20,.32);armHeat=1.;armMetal=.65;armRough=.32;}
if(armTier>6.5){armBase=vec3(.43,.39,.31);armEdge=vec3(.85,.73,.48);armHeat=.85;armMetal=.6;armRough=.29;}
vec3 armAlbedo=mix(armBase*.55,armBase*1.7,armCloud);
armAlbedo*=.77+armGrain*.36+armPores*.16;
armAlbedo=mix(armAlbedo,armEdge,armLip*(.24+armGrain*.4));
armAlbedo=mix(armAlbedo,armBase*.12,armSeam*.90);
// Sparse worn facets and mineral flecks catch light above the recessed seams.
float armFlecks=smoothstep(.73,.86,armPores)*smoothstep(.40,.65,armGrain);
armAlbedo+=armEdge*armFlecks*.28;
// Thin tool marks on metal, mottled dermis on early tiers, mineral strata at VII.
float armScratchNoise=armNoise(armP*vec3(28.,1.6,2.8));
float armScratch=smoothstep(.68,.80,armScratchNoise)*smoothstep(.3,.65,armCloud);
float armMetalWear=step(2.5,armTier)*(1.-step(6.5,armTier));
armAlbedo=mix(armAlbedo,armEdge*.65,armScratch*armMetalWear*.34);
float armStrata=armNoise(armP*vec3(.7,.7,6.)+armCloud*3.);
armAlbedo*=mix(1.,.67+armStrata*.6,step(6.5,armTier));
diffuseColor.rgb=mix(diffuseColor.rgb,armAlbedo,armMask);
`;

export const COMBAT_ARM_NORMAL = /* glsl */`
// Screen derivatives turn the same plate field into relief, including tiny pores.
// Limit subpixel relief so distant hands do not shimmer.
float armDetailFade=1.-smoothstep(.15,.65,length(fwidth(armP)));
float armHeight=(smoothstep(.015,.14,armCell.y)*.65+armGrain*.09+armPores*.035)*armDetailFade;
vec3 armDx=dFdx(-vViewPosition),armDy=dFdy(-vViewPosition);
vec3 armRx=cross(armDy,normal),armRy=cross(normal,armDx);
float armDet=dot(armDx,armRx);
vec3 armGrad=sign(armDet)*(dFdx(armHeight)*armRx+dFdy(armHeight)*armRy);
normal=normalize(abs(armDet)*normal-armGrad*.00045*armMask);
`;
