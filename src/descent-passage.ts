import * as THREE from 'three';
import {createDescentState,descentAt} from './descent';
import {descentBoundary,descentDistance,PASSAGE_BOTTOM,PASSAGE_SPAN} from './descent-motion';

const FIELD=`
float fallHash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.53));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float fallNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(fallHash(i),fallHash(i+vec3(1,0,0)),f.x),mix(fallHash(i+vec3(0,1,0)),fallHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(fallHash(i+vec3(0,0,1)),fallHash(i+vec3(1,0,1)),f.x),mix(fallHash(i+vec3(0,1,1)),fallHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fallField(vec3 p){return fallNoise(p)*.58+fallNoise(p*2.03+9.)*.28+fallNoise(p*4.11-5.)*.14;}
float fallFade(float y){return smoothstep(-92.,-60.,y)*(1.-smoothstep(92.,148.,y));}
`;
const UNIFORMS=`uniform float fallDistance,fallClock,fallFire,fallArchitecture,fallDark,fallCosmic;uniform vec3 fallTint,fallHaze;`;

/** World-space references outside the entire initial arena. Nothing follows the
 * player's horizontal translation: close/far objects retain real parallax.
 * All recurring geometry wraps only above/below its fully faded ends. */
export class DescentPassage {
  readonly group=new THREE.Group();
  readonly rocks:THREE.InstancedMesh;
  readonly masonry:THREE.InstancedMesh;
  readonly banks:THREE.Mesh;
  readonly motes:THREE.Mesh;
  private state=createDescentState();
  private reduced=false;
  private low=false;
  private dummy=new THREE.Object3D();
  readonly uniforms={fallDistance:{value:0},fallClock:{value:0},fallFire:{value:0},fallArchitecture:{value:0},fallDark:{value:0},fallCosmic:{value:0},fallTint:{value:new THREE.Color()},fallHaze:{value:new THREE.Color()},fallRight:{value:new THREE.Vector3()},fallUp:{value:new THREE.Vector3()},fallForward:{value:new THREE.Vector3()},fallBoundary:{value:0},fallBoundaryPresence:{value:0},fallStone:{value:null as THREE.Texture|null}};
  constructor(scene:THREE.Scene,floor:THREE.MeshBasicMaterial){
    this.uniforms.fallStone.value=floor.map;
    this.group.name='descent-passage';this.group.visible=false;scene.add(this.group);
    let seed=78439;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const stoneMaterial=(architecture:boolean)=>new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:true,alphaTest:.01,toneMapped:false,
      vertexShader:`${UNIFORMS}varying vec3 fallWorld,fallNormal,fallSurface;varying float fallOpacity;
       void main(){vec4 p=instanceMatrix*vec4(position,1.);fallSurface=p.xyz;float centerY=mod(instanceMatrix[3].y+fallDistance+92.,240.)-92.;p.y=centerY+(p.y-instanceMatrix[3].y);fallOpacity=smoothstep(-92.,-60.,centerY)*(1.-smoothstep(92.,148.,centerY));
        fallWorld=p.xyz;fallNormal=normalize(mat3(instanceMatrix)*(normal/vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz))));
        gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`${UNIFORMS}${FIELD}uniform sampler2D fallStone;varying vec3 fallWorld,fallNormal,fallSurface;varying float fallOpacity;
       void main(){vec3 n=normalize(fallNormal),eye=normalize(cameraPosition-fallWorld);float grain=fallField(fallSurface*.48);float light=.24+.76*max(0.,dot(n,normalize(vec3(-.4,.8,-.3))));
        float rim=pow(1.-abs(dot(n,eye)),3.);float fissure=1.-smoothstep(.018,.055,abs(fallField(fallSurface*.19)-.48));
        vec3 blend=pow(abs(n),vec3(4.));blend/=max(.001,blend.x+blend.y+blend.z);
        vec3 mineral=texture2D(fallStone,fract(fallSurface.yz*.16)).rgb*blend.x+texture2D(fallStone,fract(fallSurface.xz*.16)).rgb*blend.y+texture2D(fallStone,fract(fallSurface.xy*.16)).rgb*blend.z;
        vec3 color=fallTint*(.45+grain*.9)*light*(.65+mineral*1.8)+fallTint*rim*.22;
        color+=vec3(.16,.022,.003)*fallFire*(fissure*.5+max(0.,-n.y)*.24)*${architecture?'.12':'1.'};
        color+=vec3(.025,.055,.095)*fallCosmic*rim;
        ${architecture?'float courses=1.-smoothstep(.025,.09,abs(sin(fallSurface.y*1.7)));color*=1.-courses*.3;':''}
        float haze=1.-exp(-length(fallWorld-cameraPosition)*.004);color=mix(color,fallHaze,haze);
        float alpha=fallOpacity*${architecture?'fallArchitecture':'(1.-fallArchitecture*.64)'};
        if(alpha<.015)discard;gl_FragColor=vec4(color*(1.-fallDark*.64),alpha);}`});
    const rock=new THREE.IcosahedronGeometry(1,2),p=rock.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),s=.82+.17*Math.sin(x*13+y*8-z*11);p.setXYZ(i,x*s,y*s,z*s);}rock.computeVertexNormals();
    this.rocks=new THREE.InstancedMesh(rock,stoneMaterial(false),144);this.rocks.name='passing-rock-shelves';this.rocks.frustumCulled=false;
    for(let i=0;i<144;i++){
      // Interleave all three distances so low quality retains every depth layer.
      const tier=i%3,radius=43+tier*27+random()*12,angle=random()*Math.PI*2;
      this.dummy.position.set(Math.cos(angle)*radius,random()*PASSAGE_SPAN+PASSAGE_BOTTOM,Math.sin(angle)*radius);
      this.dummy.rotation.set(random()*2,angle,random()*.8);
      const size=1.3+random()*3.8+tier*1.3;this.dummy.scale.set(size*(1+random()*1.6),size*(.3+random()*.6),size);
      this.dummy.updateMatrix();this.rocks.setMatrixAt(i,this.dummy.matrix);
    }
    this.masonry=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),stoneMaterial(true),420);this.masonry.name='passing-cathedral-balconies';this.masonry.frustumCulled=false;
    let index=0;
    for(let level=0;level<6;level++)for(let bay=0;bay<7;bay++){
      const angle=bay*Math.PI*2/7+.22,r=49+(level%2)*20,tx=-Math.sin(angle),tz=Math.cos(angle),cx=Math.cos(angle)*r,cz=Math.sin(angle)*r,y=level*40-92;
      const block=(across:number,up:number,w:number,h:number,d:number)=>{this.dummy.position.set(cx+tx*across,y+up,cz+tz*across);this.dummy.rotation.set(0,-angle,0);this.dummy.scale.set(d,h,w);this.dummy.updateMatrix();this.masonry.setMatrixAt(index++,this.dummy.matrix);};
      // Interrupted balconies and cornices give vertical pillars measurable scale.
      block(0,0,30,1.8,5.8);block(0,1.6,31.5,.55,6.8);block(0,-2,29,.65,4.5);
      for(const side of [-1,1]){block(side*13,10,2.5,18,3.4);block(side*13,19,4,1.2,4.5);block(side*9,3.8,.65,5,1.2);}
      block(0,4,25,.6,1.2);
    }
    this.masonry.count=index;
    const cloudBase=new THREE.PlaneGeometry(1,1),cloudGeometry=new THREE.InstancedBufferGeometry();cloudGeometry.index=cloudBase.index;cloudGeometry.attributes=cloudBase.attributes;
    const cloudSeeds=new Float32Array(112*4);
    for(let i=0;i<112;i++){cloudSeeds[i*4]=(i%28)/28*Math.PI*2+random()*.14;cloudSeeds[i*4+1]=52+random()*79;cloudSeeds[i*4+2]=14+random()*17;cloudSeeds[i*4+3]=Math.floor(i/28);}
    cloudGeometry.setAttribute('cloudSeed',new THREE.InstancedBufferAttribute(cloudSeeds,4));cloudGeometry.instanceCount=112;
    const bankMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,toneMapped:false,
      vertexShader:`${UNIFORMS}attribute vec4 cloudSeed;uniform vec3 fallRight,fallUp;uniform float fallBoundary,fallBoundaryPresence;varying float cloudPresence;varying vec2 cloudUV;varying vec3 cloudCenter;varying float cloudSize;
       void main(){cloudPresence=cloudSeed.w<.5?fallBoundaryPresence:1.;float y=cloudSeed.w<.5?fallBoundary:mod(fallDistance+cloudSeed.w*72.+92.,240.)-92.;
        cloudCenter=vec3(cos(cloudSeed.x)*cloudSeed.y,y+sin(cloudSeed.x*3.7)*9.,sin(cloudSeed.x)*cloudSeed.y);cloudSize=cloudSeed.z;
        vec3 p=cloudCenter+(fallRight*position.x+fallUp*position.y)*cloudSize*2.;cloudUV=uv;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
      fragmentShader:`${UNIFORMS}${FIELD}uniform vec3 fallRight,fallUp,fallForward;varying float cloudPresence;varying vec2 cloudUV;varying vec3 cloudCenter;varying float cloudSize;
       void main(){vec2 xy=(cloudUV-.5)*2.;float r2=dot(xy,xy);if(r2>=1.)discard;
        float extent=sqrt(1.-r2),stepLength=extent*2./7.;float opacity=0.;vec3 color=vec3(0.);
        for(int i=0;i<7;i++){float z=-extent+(float(i)+.5)*stepLength;vec3 p=cloudCenter+(fallRight*xy.x+fallUp*xy.y+fallForward*z)*cloudSize;
         vec3 q=p*.075;float noise=fallNoise(q)*.65+fallNoise(q*2.07+7.)*.35;
         float radial=1.-smoothstep(.55,1.,sqrt(r2+z*z));float density=smoothstep(.30,.68,noise)*radial;
         float light=.42+.58*smoothstep(-.7,.9,xy.y+noise*.45);
         vec3 tint=mix(fallTint*.65,vec3(.075,.018,.007),fallFire*.8);
         float a=1.-exp(-density*stepLength*1.7);color+=(1.-opacity)*a*tint*light;opacity+=(1.-opacity)*a;
        }
        float fade=fallFade(cloudCenter.y)*(1.-smoothstep(140.,200.,length(cloudCenter-cameraPosition)))*(1.-fallCosmic*.65)*(1.-fallDark*.65);
        gl_FragColor=vec4(color/max(opacity,.001),opacity*fade*.64*cloudPresence);}`});
    this.banks=new THREE.Mesh(cloudGeometry,bankMaterial);this.banks.name='crossing-cloud-strata';this.banks.frustumCulled=false;this.banks.renderOrder=3;
    const quad=new THREE.PlaneGeometry(1,1),motes=new THREE.InstancedBufferGeometry();motes.index=quad.index;motes.attributes=quad.attributes;
    const seeds=new Float32Array(640*4);for(let i=0;i<seeds.length;i++)seeds[i]=random();motes.setAttribute('fallSeed',new THREE.InstancedBufferAttribute(seeds,4));motes.instanceCount=640;
    this.motes=new THREE.Mesh(motes,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
      vertexShader:`${UNIFORMS}${FIELD}attribute vec4 fallSeed;uniform vec3 fallRight,fallUp;varying vec2 fallUV;varying float fallAlpha;
       void main(){float angle=fallSeed.x*6.2831853,r=34.+fallSeed.y*65.;vec3 p=vec3(cos(angle)*r,mod(fallSeed.z*150.+fallDistance*1.12+60.,150.)-60.,sin(angle)*r);
        float size=.018+fallSeed.w*.065;fallAlpha=smoothstep(-60.,-35.,p.y)*(1.-smoothstep(55.,90.,p.y));
        p+=fallRight*position.x*size+fallUp*position.y*size*(2.+fallSeed.w*5.);fallUV=uv;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
      fragmentShader:`${UNIFORMS}varying vec2 fallUV;varying float fallAlpha;void main(){vec2 d=abs(fallUV-.5)*2.;float a=pow(max(0.,1.-d.x*d.x-d.y*d.y),2.);vec3 c=mix(fallTint*.9,vec3(.85,.18,.025),fallFire);gl_FragColor=vec4(c,a*fallAlpha*.55*(1.-fallDark*.8));}`}));
    this.motes.name='upward-slipstream';this.motes.frustumCulled=false;this.motes.renderOrder=5;
    this.group.add(this.rocks,this.masonry,this.banks,this.motes);
  }
  configure(quality:string,reduced=false){this.reduced=reduced;this.low=quality==='low';this.rocks.count=this.low?72:144;(this.motes.geometry as THREE.InstancedBufferGeometry).instanceCount=this.low?240:640;(this.banks.geometry as THREE.InstancedBufferGeometry).instanceCount=this.low?56:112;}
  update(camera:THREE.Camera,time:number,enabled=true){
    this.group.visible=enabled;if(!enabled)return;
    const s=descentAt(time,this.state),u=this.uniforms,t=this.reduced?0:s.time,distance=descentDistance(t);
    u.fallDistance.value=distance;u.fallClock.value=t;u.fallFire.value=s.furnace;u.fallCosmic.value=s.cosmic;u.fallDark.value=s.crown;
    const veil=s.chapter===1?s.blend:s.chapter===2?1-s.blend:0;
    u.fallArchitecture.value=Math.max(s.cathedral,veil*.5);
    u.fallTint.value.setRGB(.062+s.cosmic*.012+s.furnace*.025,.073-s.furnace*.042-veil*.025,.10-s.furnace*.072+veil*.012);
    u.fallHaze.value.fromArray(s.haze);
    u.fallRight.value.setFromMatrixColumn(camera.matrixWorld,0);u.fallUp.value.setFromMatrixColumn(camera.matrixWorld,1);
    u.fallForward.value.setFromMatrixColumn(camera.matrixWorld,2);
    const boundaryDistance=Math.abs(s.time-descentBoundary(s.time));
    const boundaryFade=Math.max(0,Math.min(1,(boundaryDistance-9)/6));
    u.fallBoundaryPresence.value=this.reduced?1:1-boundaryFade*boundaryFade*(3-2*boundaryFade);
    u.fallBoundary.value=this.reduced?-55:distance-descentDistance(descentBoundary(s.time));
  }
  get diagnostics(){return {visible:this.group.visible,distance:this.uniforms.fallDistance.value,reduced:this.reduced,rocks:this.rocks.count,masonry:this.masonry.count,banks:(this.banks.geometry as THREE.InstancedBufferGeometry).instanceCount,motes:(this.motes.geometry as THREE.InstancedBufferGeometry).instanceCount,boundary:descentBoundary(this.state.time)};}
}
