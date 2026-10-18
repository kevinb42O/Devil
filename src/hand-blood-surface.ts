/** Stable bind-space deposits: fine spatter grows into connected finger and palm smears. */
export const HAND_BLOOD_COLOR=/* glsl */`
float handBloodBias=clamp(vCombatBloodMask,0.,1.);
vec3 handBloodP=armP*vec3(1.7,.75,1.7);
float handBloodCloud=armNoise(handBloodP*.68+vec3(19.,4.,7.));
float handBloodStreak=armNoise(handBloodP*vec3(1.8,.22,1.8)+31.);
float handBloodFine=armNoise(armP*4.3+71.);
float handBloodField=clamp((handBloodCloud*.57+handBloodStreak*.28+handBloodFine*.15-.22)/.56,0.,1.);
// Hands soak early; the rest keeps accumulating after the fingers have saturated.
float handBloodReach=max(combatBloodAmount*(.28+handBloodBias*.90)*smoothstep(.12,.65,handBloodBias),combatBloodBody*(.9+handBloodBias*.25));
float handBloodEdge=max(fwidth(handBloodField)*1.2,.012);
float handBloodMask=smoothstep(1.-handBloodReach-handBloodEdge,1.-handBloodReach+handBloodEdge,handBloodField);
// Sparse separate drops sit ahead of the connected smears, including on the torso and legs.
vec3 bloodCell=floor(armP*2.1+13.),bloodLocal=fract(armP*2.1+13.);
vec3 bloodCenter=vec3(armHash(bloodCell),armHash(bloodCell+17.),armHash(bloodCell+43.))*.6+.2;
float bloodRadius=.09+armHash(bloodCell+79.)*.15;
float bloodDot=1.-smoothstep(bloodRadius-.025,bloodRadius+.025,length(bloodLocal-bloodCenter));
float bloodDotReach=smoothstep(0.,.08,handBloodReach)*step(armHash(bloodCell+97.),handBloodReach*1.3);
handBloodMask=max(handBloodMask,bloodDot*bloodDotReach);
// At saturation even the last clean gaps fill in, including horns, claws and feet.
handBloodMask=mix(handBloodMask,1.,smoothstep(.9,1.,combatBloodBody));
handBloodMask*=combatActive*step(.001,max(combatBloodAmount,combatBloodBody));
// Fresh deposits are red and glossy; dried blood stays as dark, rough staining.
float bloodWet=clamp(combatBloodFresh*(.65+handBloodCloud*.35),0.,1.);
vec3 handBloodColor=mix(vec3(.048,.0025,.004),vec3(.30,.007,.015),bloodWet);
handBloodColor*=.72+handBloodCloud*.45;
diffuseColor.rgb=mix(diffuseColor.rgb,handBloodColor,handBloodMask);
`;

/** A shallow liquid film softens skin relief and gives smear edges a small meniscus. */
export const BODY_BLOOD_NORMAL=/* glsl */`
float bloodFilm=handBloodMask*(.24+handBloodCloud*.12+handBloodStreak*.08)*bloodWet;
vec3 bloodFilmGradient=sign(armDet)*(dFdx(bloodFilm)*armRx+dFdy(bloodFilm)*armRy);
normal=normalize(abs(armDet)*normal-bloodFilmGradient*.00012);
`;
