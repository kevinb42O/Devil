import * as THREE from 'three';

/** Distant atmosphere follows camera translation, while its landmarks stay fixed in the world. */
export class AbyssSky {
  readonly mesh:THREE.Mesh;
  private time={value:0};
  constructor(){
    const material=new THREE.ShaderMaterial({
      uniforms:{time:this.time},side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,
      vertexShader:`varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`
        uniform float time;varying vec3 skyDirection;
        float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
        float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float cloud(vec3 p){float n=0.;float a=.5;for(int i=0;i<4;i++){n+=a*noise(p);p=p*2.03+vec3(7.1,3.2,1.7);a*=.5;}return n;}
        void main(){
          vec3 d=normalize(skyDirection);float height=smoothstep(-.03,.38,d.y);
          vec3 color=mix(vec3(.001,.002,.004),vec3(.018,.015,.038),max(d.y,0.));
          vec3 p=d*4.8+vec3(time*.0015,0.,time*.001);
          float n=cloud(p+cloud(p*.65)*2.8);
          float band=exp(-pow((d.y-.4-d.x*.24)/.3,2.));
          float wisps=smoothstep(.4,.7,n)*band;
          color+=mix(vec3(.035,.017,.065),vec3(.09,.025,.023),smoothstep(-.5,.6,d.x))*wisps;
          color*=1.-smoothstep(.55,.78,cloud(p*1.5+12.))* .65;
          // Sparse world-anchored stars, softened to avoid sparkling aliasing.
          vec3 cell=d*180.;vec3 cellId=floor(cell),cellUV=fract(cell)-.5;
          float star=pow(max(0.,1.-length(cellUV)*2.8),6.)*step(.994,hash(cellId));
          color+=vec3(.38,.36,.45)*star*(.8+.2*sin(time*.15+hash(cellId)*30.));
          // A dark moon with a warm corona; high above the combat horizon.
          vec3 moonDir=normalize(vec3(-.65,.62,-.9));float angle=length(d-moonDir),radius=.093;
          float disk=1.-smoothstep(radius-.001,radius+.001,angle);
          float halo=exp(-abs(angle-radius)*100.)*.12+exp(-angle*14.)*.014;
          color+=vec3(.8,.24,.13)*halo;
          color=mix(color,vec3(.005,.004,.009),disk);
          float limb=exp(-abs(angle-radius)*450.)*(.35+.65*smoothstep(-.04,.06,d.x-moonDir.x));
          color+=vec3(.21,.08,.065)*limb;
          gl_FragColor=vec4(color*height,1.);
        }`
    });
    this.mesh=new THREE.Mesh(new THREE.SphereGeometry(120,32,20),material);
    this.mesh.frustumCulled=false;this.mesh.renderOrder=-100;
  }
  update(camera:THREE.Camera,time:number){this.mesh.position.copy(camera.position);this.time.value=time;}
}
