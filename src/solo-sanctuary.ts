import * as THREE from 'three';
/** Single-player-only courtyard atmosphere. All decoration stays outside the approach. */
export class SoloSanctuary {
 readonly group=new THREE.Group();private cloth:THREE.Mesh[]=[];private dust:THREE.Points;private sky:THREE.Mesh;
 private reduced=false;private quality='high';
 private uniforms={sanctuaryTime:{value:0},sanctuarySpace:{value:new THREE.Texture()}};
 constructor(scene:THREE.Scene,texture:THREE.Texture){
  this.group.name='solo-moonlit-sanctuary';scene.add(this.group);
  const sky=this.sky=new THREE.Mesh(new THREE.SphereGeometry(130,40,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,uniforms:this.uniforms,
   vertexShader:'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 skyDirection;uniform sampler2D sanctuarySpace;
    void main(){vec3 d=normalize(skyDirection);vec2 uv=vec2(fract(atan(d.z,d.x)*.159154943+1.),asin(clamp(d.y,-1.,1.))*.318309886+.5);
     vec3 stars=texture2D(sanctuarySpace,uv).rgb;
     float seam=smoothstep(0.,.025,uv.x)*(1.-smoothstep(.975,1.,uv.x));
     float pole=1.-smoothstep(.70,.96,d.y);
     gl_FragColor=vec4(stars*.45*seam*pole,1.);
    }`}));sky.name='sanctuary-space-sky';sky.renderOrder=100000;sky.frustumCulled=false;this.group.add(sky);
  const stone=new THREE.MeshStandardMaterial({map:texture,color:0x252e39,roughness:.88,metalness:.04});
  const trim=new THREE.MeshStandardMaterial({color:0x625044,roughness:.8,metalness:.12});
  // Edge coping and lamp standards frame the route without narrowing its collision bounds.
  const masonry=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),stone,30),block=new THREE.Object3D();let blockCount=0;
  const coping=(x:number,y:number,z:number,w:number,h:number,d:number)=>{block.position.set(x,y,z);block.scale.set(w,h,d);block.updateMatrix();masonry.setMatrixAt(blockCount++,block.matrix);};
  for(const side of [-1,1]){
   for(let j=0;j<12;j++)coping(side*6.8,.04,-7+j*1.6,.34,.18,1.6);
   coping(side*6.95,.44,5.7,.65,.18,3.4);
   for(const z of [4.5,6.9])coping(side*6.95,.18,z,.5,.36,.35);
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,4.7,8),trim);pole.position.set(side*6.65,2.35,-3.8);this.group.add(pole);
   const cross=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.5,8),trim);cross.rotation.z=Math.PI/2;cross.position.set(side*6.05,4.55,-3.8);this.group.add(cross);
   const material=new THREE.ShaderMaterial({uniforms:this.uniforms,side:THREE.DoubleSide,lights:false,toneMapped:false,
    vertexShader:`varying vec2 clothUV;varying float fold;uniform float sanctuaryTime;void main(){clothUV=uv;vec3 p=position;float hang=1.-uv.y;fold=sin(uv.x*17.+hang*2.);p.z+=fold*.055+sin(sanctuaryTime*.65+uv.x*4.+hang*3.)*.13*hang*hang;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`varying vec2 clothUV;varying float fold;void main(){vec2 uv=clothUV;float hem=.055+.02*sin(uv.x*17.)+.018*sin(uv.x*39.);if(uv.y<hem)discard;
     float border=step(.07,uv.x)*step(uv.x,.93);float stitch=smoothstep(.008,.012,abs(uv.x-.09))*smoothstep(.008,.012,abs(uv.x-.91));
     vec3 cloth=mix(vec3(.065,.047,.030),vec3(.014,.033,.036),border);cloth*=.75+.25*fold;cloth+=vec3(.06,.042,.02)*(1.-stitch)*.5;
     gl_FragColor=vec4(cloth,1.);}`} );
   const banner=new THREE.Mesh(new THREE.PlaneGeometry(1.15,2.8,18,28),material);banner.position.set(side*6.05,3.12,-3.8);banner.rotation.y=side*.13;banner.name='sanctuary-weathered-banner';this.cloth.push(banner);this.group.add(banner);
  }
  masonry.name='sanctuary-coping-and-benches';this.group.add(masonry);
  const positions=new Float32Array(180*3),phases=new Float32Array(180);let seed=6413;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<180;i++){positions.set([(random()-.5)*15,random()*6.5,-9+random()*22],i*3);phases[i]=random();}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('motePhase',new THREE.BufferAttribute(phases,1));
  this.dust=new THREE.Points(geometry,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,toneMapped:false,
   vertexShader:`attribute float motePhase;uniform float sanctuaryTime;varying float alpha;void main(){vec3 p=position;p.x+=sin(sanctuaryTime*.13+motePhase*31.)*.35;p.z+=cos(sanctuaryTime*.11+motePhase*23.)*.25;p.y+=sin(sanctuaryTime*.17+motePhase*43.)*.2;
    float warm=exp(-length(p-vec3(0.,1.7,-7.))*.22);alpha=.07+warm*.32;vec4 view=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(30./max(1.,-view.z),.6,2.);gl_Position=projectionMatrix*view;}`,
   fragmentShader:`varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.55,.58,.55,pow(max(0.,1.-r),2.)*alpha);}`}));this.dust.name='sanctuary-suspended-motes';this.group.add(this.dust);
 }
 configure(quality:string,reduced:boolean){this.quality=quality;this.reduced=reduced;this.dust.geometry.setDrawRange(0,quality==='high'?180:70);}
 setSpace(texture:THREE.Texture){this.uniforms.sanctuarySpace.value=texture;}
 update(time:number,position:{x:number;y:number;z:number}){this.uniforms.sanctuaryTime.value=this.reduced?0:Math.max(0,time);this.sky.position.set(position.x,position.y,position.z);}
 get diagnostics(){return {quality:this.quality,reduced:this.reduced,motes:this.quality==='high'?180:70,clock:this.uniforms.sanctuaryTime.value,sky:'cosmic-expanse',spaceLoaded:!!this.uniforms.sanctuarySpace.value.image,scope:'single-player-only'};}
}
