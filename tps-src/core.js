"use strict";
/* ───── 공통 엔진: 수학, 렌더러, 효과, 소리, 입력, 화면 전환 ───── */
const TAU=Math.PI*2,{sin,cos,atan2,hypot,min,max,abs,floor,PI,sqrt,pow,round,sign}=Math;
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,rnd=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a),pick=a=>a[Math.random()*a.length|0];
const damp=(a,b,k,dt)=>lerp(a,b,1-Math.exp(-k*dt));
const wrapA=a=>{while(a>PI)a-=TAU;while(a<-PI)a+=TAU;return a};
const dampA=(a,b,k,dt)=>a+wrapA(b-a)*(1-Math.exp(-k*dt));
const $=id=>document.getElementById(id);
const DEBUG=location.hash==='#debug',RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
function fatal(msg){const m=$('menu');if(m){m.querySelector('.lead').textContent=msg;const s=$('start');if(s)s.hidden=true}throw new Error(msg)}
if(!window.THREE)fatal('3D 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침하세요.');
const V=THREE.Vector3,C=hex=>new THREE.Color(hex);
let R;
try{R=new THREE.WebGLRenderer({canvas:$('cv'),antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:DEBUG})}
catch(e){fatal('이 브라우저에서는 WebGL을 쓸 수 없어 게임을 실행할 수 없습니다.')}
R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1;R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(68,1,.1,1400);
let PR=min(devicePixelRatio||1,1.5),VW=1,VH=1;
function resize(){VW=innerWidth;VH=innerHeight;R.setPixelRatio(PR);R.setSize(VW,VH,false);cam.aspect=VW/VH;cam.updateProjectionMatrix()}
addEventListener('resize',resize);resize();

/* 시간 */
const T={ui:0,ts:1,hold:0,stop:0,trauma:0,flash:0,flashCol:''};
const shake=v=>{T.trauma=min(1,T.trauma+v*(RM?.25:1))};
const slowmo=(v,d)=>{T.ts=v;T.hold=d};
const hitstop=d=>{T.stop=max(T.stop,RM?0:d)};
function flash(col,a){const f=$('flash');f.style.background=col;f.getAnimations().forEach(x=>x.cancel());f.animate([{opacity:RM?a*.3:a},{opacity:0}],{duration:360,easing:'ease-out'})}

/* 입자: 정점 하나당 부드러운 원 하나 */
const PV=`attribute float size;attribute vec4 col;varying vec4 vC;uniform float uS;void main(){vC=col;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=min(size*uS/-mv.z,400.);gl_Position=projectionMatrix*mv;}`;
const PF=`varying vec4 vC;void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,.1,d);if(a<.01)discard;gl_FragColor=vec4(vC.rgb,vC.a*a);}`;
class Particles{
  constructor(n,additive){
    this.n=n;this.i=0;this.p=new Float32Array(n*3);this.c=new Float32Array(n*4);this.s=new Float32Array(n);
    this.v=new Float32Array(n*3);this.l=new Float32Array(n);this.m=new Float32Array(n);this.s0=new Float32Array(n);this.g=new Float32Array(n);this.gr=new Float32Array(n);this.dr=new Float32Array(n);this.a0=new Float32Array(n);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(this.p,3));g.setAttribute('col',new THREE.BufferAttribute(this.c,4));g.setAttribute('size',new THREE.BufferAttribute(this.s,1));
    this.u={uS:{value:600}};
    this.mesh=new THREE.Points(g,new THREE.ShaderMaterial({uniforms:this.u,vertexShader:PV,fragmentShader:PF,transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending}));
    this.mesh.frustumCulled=false;this.mesh.renderOrder=5;scene.add(this.mesh);
  }
  emit(x,y,z,vx,vy,vz,size,life,r,g,b,a=1,o){
    const i=this.i;this.i=(i+1)%this.n;const i3=i*3,i4=i*4;
    this.p[i3]=x;this.p[i3+1]=y;this.p[i3+2]=z;this.v[i3]=vx;this.v[i3+1]=vy;this.v[i3+2]=vz;
    this.c[i4]=r;this.c[i4+1]=g;this.c[i4+2]=b;this.c[i4+3]=a;this.a0[i]=a;this.s[i]=size;this.s0[i]=size;this.l[i]=life;this.m[i]=life;
    this.g[i]=o&&o.g||0;this.gr[i]=o&&o.grow||0;this.dr[i]=o&&o.drag||0;
  }
  update(dt){
    for(let i=0;i<this.n;i++){
      if(this.l[i]<=0)continue;
      this.l[i]-=dt;const i3=i*3;
      if(this.l[i]<=0){this.s[i]=0;this.c[i*4+3]=0;continue}
      const d=this.dr[i]?Math.exp(-this.dr[i]*dt):1;
      this.v[i3]*=d;this.v[i3+1]=this.v[i3+1]*d-this.g[i]*dt;this.v[i3+2]*=d;
      this.p[i3]+=this.v[i3]*dt;this.p[i3+1]+=this.v[i3+1]*dt;this.p[i3+2]+=this.v[i3+2]*dt;
      const k=this.l[i]/this.m[i];this.c[i*4+3]=this.a0[i]*k;this.s[i]=this.s0[i]+this.gr[i]*(1-k);
    }
    const g=this.mesh.geometry;g.attributes.position.needsUpdate=true;g.attributes.col.needsUpdate=true;g.attributes.size.needsUpdate=true;
    this.u.uS.value=VH*R.getPixelRatio()/(2*Math.tan(cam.fov*PI/360));
  }
}
const fxA=new Particles(1600,true),fxS=new Particles(700,false);

/* 파편 */
const CHUNKS=160,chunkMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x2a2a30,roughness:.8,metalness:.3,flatShading:true}),CHUNKS);
chunkMesh.frustumCulled=false;chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(chunkMesh);
const chunks=[];for(let i=0;i<CHUNKS;i++)chunks.push({l:0,p:new V(),v:new V(),r:new V(),w:new V(),s:1});let chunkI=0;const dmy=new THREE.Object3D();
function chunk(x,y,z,sp,s){const q=chunks[chunkI];chunkI=(chunkI+1)%CHUNKS;q.l=rnd(.8,2);q.p.set(x,y,z);q.v.set(rnd(-sp,sp),rnd(.3,1.3)*sp,rnd(-sp,sp));q.w.set(rnd(-9,9),rnd(-9,9),rnd(-9,9));q.s=s}
function updChunks(dt,floorY=0){
  for(let i=0;i<CHUNKS;i++){const q=chunks[i];
    if(q.l>0){q.l-=dt;q.v.y-=24*dt;q.p.addScaledVector(q.v,dt);q.r.addScaledVector(q.w,dt);if(q.p.y<floorY+q.s*.3){q.p.y=floorY+q.s*.3;q.v.y*=-.35;q.v.x*=.6;q.v.z*=.6;q.w.multiplyScalar(.5)}}
    dmy.position.copy(q.p);dmy.rotation.set(q.r.x,q.r.y,q.r.z);const s=q.l>0?q.s*min(1,q.l*3):0;dmy.scale.set(s,s*.7,s);dmy.updateMatrix();chunkMesh.setMatrixAt(i,dmy.matrix);
  }
  chunkMesh.instanceMatrix.needsUpdate=true;
}

/* 고리와 바닥 경고 */
const ringGeo=new THREE.RingGeometry(.9,1,56),discGeo=new THREE.CircleGeometry(1,40);ringGeo.rotateX(-PI/2);discGeo.rotateX(-PI/2);
const rings=[];for(let i=0;i<14;i++){const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}));m.visible=false;m.renderOrder=4;scene.add(m);rings.push({m,l:0,max:1,r0:0,r1:1})}
let ringI=0;
function shock(x,y,z,r0,r1,life,col=0xffd9a0){const q=rings[ringI];ringI=(ringI+1)%rings.length;q.m.position.set(x,y+.1,z);q.m.material.color.set(col);q.l=q.max=life;q.r0=r0;q.r1=r1;q.m.visible=true;q.m.rotation.set(0,0,0)}
const tels=[];for(let i=0;i<14;i++){const g=new THREE.Group();const a=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0xff3a30,transparent:true,opacity:.9,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));const b=new THREE.Mesh(discGeo,new THREE.MeshBasicMaterial({color:0xff3a30,transparent:true,opacity:.28,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));g.add(a,b);g.visible=false;g.renderOrder=3;scene.add(g);tels.push({g,b,l:0,max:1})}
function telegraph(x,y,z,r,life){const q=tels.find(t=>t.l<=0)||tels[0];q.g.position.set(x,y+.06,z);q.g.scale.set(r,1,r);q.g.visible=true;q.l=q.max=life;return q}
function updRings(dt){
  for(const q of rings){if(q.l<=0)continue;q.l-=dt;if(q.l<=0){q.m.visible=false;continue}const k=1-q.l/q.max,e=1-pow(1-k,3),r=lerp(q.r0,q.r1,e);q.m.scale.set(r,1,r);q.m.material.opacity=1-k}
  for(const q of tels){if(q.l<=0)continue;q.l-=dt;if(q.l<=0){q.g.visible=false;continue}const k=1-q.l/q.max;q.b.scale.set(k,1,k)}
}

/* 순간 조명 */
const flashes=[];for(let i=0;i<3;i++){const l=new THREE.PointLight(0xffb060,0,60,2);scene.add(l);flashes.push({l,t:0,max:1,i:0})}let flI=0;
function lightFlash(x,y,z,col,i,dur){const q=flashes[flI];flI=(flI+1)%flashes.length;q.l.position.set(x,y,z);q.l.color.set(col);q.i=i;q.t=q.max=dur;q.l.intensity=i}
function updFlashes(dt){for(const q of flashes){if(q.t>0){q.t-=dt;q.l.intensity=q.t>0?q.i*q.t/q.max:0}}}

/* 폭발 */
function boom(x,y,z,sz=1,o={}){
  lightFlash(x,y+1,z,o.col||0xff9a50,500*sz*sz,.3+.12*sz);
  shock(x,o.floor??.05,z,sz*.5,sz*5.5,.45+.1*sz,o.ring||0xffd9a0);
  for(let i=0,n=20*sz;i<n;i++){const a=rnd(TAU),e=rnd(-.2,1),v=rnd(1,8)*sz;fxA.emit(x,y,z,cos(a)*v,e*v,sin(a)*v,rnd(1.2,3)*sz,rnd(.2,.5),1,rnd(.45,.8),.2,.95,{drag:3})}
  for(let i=0,n=16*sz;i<n;i++){const a=rnd(TAU),e=rnd(0,1),v=rnd(10,34)*sqrt(sz);fxA.emit(x,y,z,cos(a)*v,e*v,sin(a)*v,rnd(.12,.28),rnd(.3,.8),1,.8,.45,1,{g:26,drag:1})}
  for(let i=0,n=10*sz;i<n;i++){const a=rnd(TAU),v=rnd(.5,3)*sz;fxS.emit(x+cos(a)*sz*.6,y,z+sin(a)*sz*.6,cos(a)*v,rnd(1,4),sin(a)*v,rnd(1,2.2)*sz,rnd(.8,1.9),.13,.11,.12,.55,{grow:2.6*sz,drag:1})}
  for(let i=0,n=min(14,4*sz);i<n;i++)chunk(x,y,z,8*sqrt(sz),rnd(.15,.5)*sqrt(sz));
  const d=cam.position.distanceTo(new V(x,y,z));shake(clamp(.5*sz/(1+d*.06),0,.8));
  Snd.boom(clamp(sz*.5*(1-d/260),.1,1.6));
}
function sparksAt(x,y,z,n=4,col=[1,.85,.5],sp=9){for(let i=0;i<n;i++)fxA.emit(x,y,z,rnd(-sp,sp),rnd(-sp*.4,sp),rnd(-sp,sp),rnd(.1,.22),rnd(.15,.4),col[0],col[1],col[2],1,{g:16})}

/* 떠오르는 글자 */
const floatEl=$('floats'),floatPool=[];const pv=new V();
function floatText(x,y,z,s,cls=''){
  pv.set(x,y,z).project(cam);if(pv.z>1)return;
  let el=floatPool.find(q=>!q._on);if(!el){if(floatPool.length>40)return;el=document.createElement('div');floatEl.appendChild(el);floatPool.push(el)}
  el._on=true;el.className='fl '+cls;el.textContent=s;const px=(pv.x*.5+.5)*VW+rnd(-12,12),py=(-pv.y*.5+.5)*VH;
  const an=el.animate([{transform:`translate(${px}px,${py}px) translate(-50%,0) scale(.5)`,opacity:1},{transform:`translate(${px}px,${py-18}px) translate(-50%,0) scale(1.15)`,opacity:1,offset:.2},{transform:`translate(${px}px,${py-62}px) translate(-50%,0) scale(1)`,opacity:0}],{duration:750,easing:'ease-out'});
  el.style.opacity=0;an.onfinish=()=>{el._on=false};
}
let hitDirT=0;
function hitDir(wx,wz,yaw){
  if(T.ui-hitDirT<.18)return;hitDirT=T.ui;
  const a=atan2(wx-cam.position.x,wz-cam.position.z);const rel=wrapA(a-yaw-PI);
  const el=document.createElement('div');el.className='arrow';const r=min(VW,VH)*.32;
  const tr=`rotate(${-rel}rad) translateY(${-r}px)`;el.style.transform=tr;$('hitdir').appendChild(el);
  el.animate([{opacity:1},{opacity:0}],{duration:800}).onfinish=()=>el.remove();
}

/* 충돌 */
function rayBoxes(ox,oy,oz,dx,dy,dz,maxT,boxes){
  let best=maxT;
  for(const b of boxes){
    let t0=0,t1=best;
    const x0=b.x-b.hw,x1=b.x+b.hw,z0=b.z-b.hd,z1=b.z+b.hd,y0=b.y0||0,y1=b.h;
    if(abs(dx)<1e-6){if(ox<x0||ox>x1)continue}else{let a=(x0-ox)/dx,c=(x1-ox)/dx;if(a>c){const s=a;a=c;c=s}t0=max(t0,a);t1=min(t1,c);if(t0>t1)continue}
    if(abs(dz)<1e-6){if(oz<z0||oz>z1)continue}else{let a=(z0-oz)/dz,c=(z1-oz)/dz;if(a>c){const s=a;a=c;c=s}t0=max(t0,a);t1=min(t1,c);if(t0>t1)continue}
    if(abs(dy)<1e-6){if(oy<y0||oy>y1)continue}else{let a=(y0-oy)/dy,c=(y1-oy)/dy;if(a>c){const s=a;a=c;c=s}t0=max(t0,a);t1=min(t1,c);if(t0>t1)continue}
    if(t0<best)best=t0;
  }
  return best;
}
function pushOut(e,r,boxes){
  for(const b of boxes){
    if((e.y||0)>=b.h)continue;
    const nx=clamp(e.x,b.x-b.hw,b.x+b.hw),nz=clamp(e.z,b.z-b.hd,b.z+b.hd);let dx=e.x-nx,dz=e.z-nz,d=hypot(dx,dz);
    if(d<r){
      if(d<1e-4){const px=b.hw-abs(e.x-b.x),pz=b.hd-abs(e.z-b.z);if(px<pz)e.x=b.x+sign(e.x-b.x||1)*(b.hw+r);else e.z=b.z+sign(e.z-b.z||1)*(b.hd+r);continue}
      e.x=nx+dx/d*r;e.z=nz+dz/d*r;
    }
  }
}
function raySphere(ox,oy,oz,dx,dy,dz,cx,cy,cz,r){const lx=cx-ox,ly=cy-oy,lz=cz-oz,tc=lx*dx+ly*dy+lz*dz;if(tc<0)return Infinity;const d2=lx*lx+ly*ly+lz*lz-tc*tc;if(d2>r*r)return Infinity;return tc-sqrt(r*r-d2)}

/* 모형 도우미 */
const unitBox=new THREE.BoxGeometry(1,1,1),unitSph=new THREE.SphereGeometry(1,16,12),unitCyl=new THREE.CylinderGeometry(1,1,1,14);
function mat(col,o={}){return new THREE.MeshStandardMaterial(Object.assign({color:col,roughness:.7,metalness:.25,flatShading:true},o))}
function glowMat(col){return new THREE.MeshBasicMaterial({color:col,toneMapped:false})}
function part(geo,m,parent,x,y,z,sx,sy,sz,shadow=true){const q=new THREE.Mesh(geo,m);q.position.set(x,y,z);q.scale.set(sx,sy,sz);q.castShadow=shadow;parent.add(q);return q}
const box=(m,p,x,y,z,sx,sy,sz,sh)=>part(unitBox,m,p,x,y,z,sx,sy,sz,sh);
const sph=(m,p,x,y,z,sx,sy=sx,sz=sx,sh)=>part(unitSph,m,p,x,y,z,sx,sy,sz,sh);
const cyl=(m,p,x,y,z,rx,h,rz=rx,sh)=>part(unitCyl,m,p,x,y,z,rx,h,rz,sh);
function pivot(p,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g}
function noiseTex(size,fn,rx=1,ry=1){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');fn(g,size);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
function skyDome(top,mid,low,sunDir,sunCol,sunSize=.03){
  const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{a:{value:C(top)},b:{value:C(mid)},c:{value:C(low)},s:{value:sunDir.clone().normalize()},sc:{value:C(sunCol)},sz:{value:sunSize}},
    vertexShader:`varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 d;uniform vec3 a,b,c,s,sc;uniform float sz;void main(){vec3 n=normalize(d);float h=n.y;vec3 col=h>.18?mix(b,a,smoothstep(.18,.75,h)):mix(c,b,smoothstep(-.02,.18,h));float k=max(dot(n,s),0.);col+=sc*(pow(k,18.)*.35+pow(k,180.)*.6);col=mix(col,sc,smoothstep(1.-sz*.08,1.-sz*.05,k));gl_FragColor=vec4(col,1.);}`});
  const q=new THREE.Mesh(new THREE.SphereGeometry(900,32,18),m);q.renderOrder=-10;q.frustumCulled=false;scene.add(q);return q;
}

/* 소리 */
const Snd={ctx:null,master:null,noise:null,muted:store.get('tps-mute')==='1',last:{},step:0,next:0,on:false,bpm:120,noteFn:null,
  init(){
    if(this.ctx){this.ctx.resume();return}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    try{this.ctx=new AC();const comp=this.ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=6;
      this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.75;this.master.connect(comp);comp.connect(this.ctx.destination);
      const len=this.ctx.sampleRate,buf=this.ctx.createBuffer(1,len,len),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;this.noise=buf;
      this.next=this.ctx.currentTime+.1;setInterval(()=>this.sched(),50);
    }catch(e){this.ctx=null}
  },
  ok(n,gap){if(!this.ctx||this.ctx.state!=='running')return false;const t=this.ctx.currentTime;if(gap&&this.last[n]&&t-this.last[n]<gap)return false;this.last[n]=t;return true},
  tone(type,f0,f1,dur,vol,when=0){const n=this.ctx.currentTime+max(0,when),o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f0,n);o.frequency.exponentialRampToValueAtTime(max(20,f1),n+dur);g.gain.setValueAtTime(vol,n);g.gain.exponentialRampToValueAtTime(.0005,n+dur);o.connect(g);g.connect(this.master);o.start(n);o.stop(n+dur+.02)},
  burst(dur,vol,f0,f1,when=0,type='lowpass'){const n=this.ctx.currentTime+max(0,when),s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noise;s.loop=true;f.type=type;f.frequency.setValueAtTime(f0,n);f.frequency.exponentialRampToValueAtTime(max(30,f1),n+dur);g.gain.setValueAtTime(vol,n);g.gain.exponentialRampToValueAtTime(.0005,n+dur);s.connect(f);f.connect(g);g.connect(this.master);s.start(n,Math.random()*.8);s.stop(n+dur+.02)},
  boom(sz=1){if(this.ok('boom',.05)){this.burst(.25+.4*sz,.25+.3*sz,2600,110);this.tone('sine',130,30,.25+.35*sz,.45*sz)}},
  gun(vol=.14,pitch=1){if(this.ok('gun',.05)){this.burst(.08,vol,5000*pitch,700,0,'bandpass');this.tone('square',300*pitch,70,.06,vol*.6)}},
  tick(){if(this.ok('tick',.05))this.tone('triangle',1500,800,.05,.09)},
  crit(){if(this.ok('crit',.06)){this.tone('triangle',1900,1200,.09,.14)}},
  zap(){if(this.ok('zap',.08))this.tone('sawtooth',720,200,.14,.06)},
  whoosh(){if(this.ok('whoosh',.15))this.burst(.4,.3,300,3200,0,'bandpass')},
  rocket(){if(this.ok('rocket',.1)){this.burst(.5,.35,900,3000,0,'bandpass');this.tone('sawtooth',160,420,.3,.1)}},
  hurt(){if(this.ok('hurt',.15)){this.burst(.25,.4,1200,200);this.tone('sawtooth',260,70,.25,.2)}},
  pick(){if(this.ok('pick',.08))[0,.06,.12].forEach((w,i)=>this.tone('triangle',660*pow(1.26,i),660*pow(1.26,i),.1,.12,w))},
  alarm(){if(this.ok('alarm',.5))for(let i=0;i<4;i++){this.tone('square',520,700,.3,.08,i*.6);this.tone('square',700,520,.28,.08,i*.6+.3)}},
  sched(){if(!this.ctx||this.ctx.state!=='running'||!this.on||!this.noteFn)return;const st=60/this.bpm/4;while(this.next<this.ctx.currentTime+.16){if(this.next<this.ctx.currentTime)this.next=this.ctx.currentTime+.02;this.noteFn(this.step,this.next-this.ctx.currentTime);this.next+=st;this.step=(this.step+1)%64}},
  setMute(m){this.muted=m;store.set('tps-mute',m?'1':'0');if(this.master)this.master.gain.value=m?0:.75;$('btnMute').textContent=m?'MUTE':'SND'}
};
const midi=m=>440*pow(2,(m-69)/12);

/* 입력 */
const In={keys:{},held:{},yaw:0,pitch:0,sens:.0023,fire:false,alt:false,locked:false,stick:{x:0,y:0},sid:null,aid:null,ax:0,ay:0,sx:0,sy:0,drag:false,keymap:{},minP:-.55,maxP:.9,touchSens:.005,
  move(){let x=this.stick.x,y=this.stick.y;const k=this.keys;if(k.KeyW||k.ArrowUp)y+=1;if(k.KeyS||k.ArrowDown)y-=1;if(k.KeyD||k.ArrowRight)x+=1;if(k.KeyA||k.ArrowLeft)x-=1;const l=hypot(x,y);if(l>1){x/=l;y/=l}return{x,y,l:min(1,l)}},
  look(dx,dy,s){this.yaw-=dx*s;this.pitch=clamp(this.pitch-dy*s,this.minP,this.maxP)},
  lock(){const p=$('cv').requestPointerLock&&$('cv').requestPointerLock();if(p&&p.catch)p.catch(()=>{})}
};
const Game={mode:'title',key:'tps',wasLocked:false};
let Hooks={};
const inPlay=()=>Game.mode==='play';
addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code)&&!(e.target&&e.target.tagName==='BUTTON'))e.preventDefault();
  if(e.repeat)return;In.keys[e.code]=true;
  const a=In.keymap[e.code];if(a){In.held[a]=true;if(inPlay()&&Hooks.press)Hooks.press(a)}
  if(e.code==='KeyP'||(e.code==='Escape'&&!In.locked))setPause(inPlay());
  if(e.code==='KeyM')Snd.setMute(!Snd.muted);
});
addEventListener('keyup',e=>{In.keys[e.code]=false;const a=In.keymap[e.code];if(a){In.held[a]=false;if(Hooks.release)Hooks.release(a)}});
const cvEl=$('cv');
cvEl.addEventListener('pointerdown',e=>{
  if(!inPlay())return;
  if(e.pointerType==='touch'){
    cvEl.setPointerCapture(e.pointerId);
    if(e.clientX<VW*.45&&In.sid===null){In.sid=e.pointerId;In.sx=e.clientX;In.sy=e.clientY;const b=$('stickBase');b.hidden=false;b.style.left=In.sx+'px';b.style.top=In.sy+'px';$('stickKnob').style.transform=''}
    else if(In.aid===null){In.aid=e.pointerId;In.ax=e.clientX;In.ay=e.clientY}
    return;
  }
  if(!In.locked)In.lock();
  In.drag=true;In.ax=e.clientX;In.ay=e.clientY;
  if(e.button===0)In.fire=true;
  if(e.button===2){In.alt=true;if(Hooks.press)Hooks.press('alt')}
});
addEventListener('pointermove',e=>{
  if(e.pointerType==='touch'){
    if(e.pointerId===In.sid){let x=(e.clientX-In.sx)/50,y=-(e.clientY-In.sy)/50;const l=hypot(x,y);if(l>1){x/=l;y/=l}In.stick.x=x;In.stick.y=y;$('stickKnob').style.transform=`translate(${x*36}px,${-y*36}px)`}
    else if(e.pointerId===In.aid){In.look(e.clientX-In.ax,e.clientY-In.ay,In.touchSens);In.ax=e.clientX;In.ay=e.clientY}
    return;
  }
  if(!inPlay())return;
  if(In.locked)In.look(e.movementX,e.movementY,In.sens);
  else if(In.drag){In.look(e.clientX-In.ax,e.clientY-In.ay,In.sens*1.5);In.ax=e.clientX;In.ay=e.clientY}
});
function ptrEnd(e){
  if(e.pointerType==='touch'){if(e.pointerId===In.sid){In.sid=null;In.stick.x=In.stick.y=0;$('stickBase').hidden=true}if(e.pointerId===In.aid)In.aid=null;return}
  if(e.button===0||e.type==='pointercancel')In.fire=false;
  if(e.button===2||e.type==='pointercancel'){if(In.alt&&Hooks.release)Hooks.release('alt');In.alt=false}
  if(e.buttons===0)In.drag=false;
}
addEventListener('pointerup',ptrEnd);addEventListener('pointercancel',ptrEnd);
cvEl.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockchange',()=>{const was=In.locked;In.locked=document.pointerLockElement===cvEl;if(was&&!In.locked&&inPlay())setPause(true)});
addEventListener('blur',()=>{for(const k in In.keys)In.keys[k]=false;for(const k in In.held)In.held[k]=false;In.fire=In.alt=false;if(!DEBUG)setPause(true)});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!DEBUG)setPause(true)});
function setPads(list){
  const box=$('pads');box.innerHTML='';
  for(const q of list){const b=document.createElement('button');b.textContent=q.label;if(q.main)b.className='main';b.setAttribute('aria-label',q.label);
    b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();try{b.setPointerCapture(e.pointerId)}catch(_){}if(q.id==='fire')In.fire=true;else{In.held[q.id]=true;if(inPlay()&&Hooks.press)Hooks.press(q.id)}});
    const up=e=>{e.stopPropagation();if(q.id==='fire')In.fire=false;else{In.held[q.id]=false;if(Hooks.release)Hooks.release(q.id)}};
    b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);box.appendChild(b)}
}

/* 화면 전환 */
function setPause(on){
  if(on&&Game.mode==='play'){Game.mode='pause';$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();if(Snd.ctx)Snd.ctx.suspend();$('resume').focus({preventScroll:true})}
  else if(!on&&Game.mode==='pause'){Game.mode='play';$('pause').hidden=true;if(Snd.ctx)Snd.ctx.resume();In.lock();cvEl.focus({preventScroll:true})}
}
function beginRun(){
  Snd.init();Snd.on=true;Snd.step=0;if(Snd.ctx)Snd.next=Snd.ctx.currentTime+.1;
  for(const id of['menu','over','pause'])$(id).hidden=true;$('btnPause').hidden=false;$('pads').classList.add('on');
  T.ts=1;T.hold=0;T.stop=0;T.trauma=0;In.fire=In.alt=false;
  Game.mode='play';Hooks.start();In.lock();cvEl.focus({preventScroll:true});
}
function toTitle(){
  if(document.pointerLockElement)document.exitPointerLock();
  Snd.on=false;if(Snd.ctx)Snd.ctx.resume();
  Game.mode='title';for(const id of['over','pause'])$(id).hidden=true;$('menu').hidden=false;$('btnPause').hidden=true;$('pads').classList.remove('on');
  $('bestMenu').textContent=(+store.get(Game.key+'-best')||0).toLocaleString();
  Hooks.toTitle();
}
function endRun({title,eye,rows,score,delay=1400}){
  const best=+store.get(Game.key+'-best')||0,nb=score>best;if(nb)store.set(Game.key+'-best',String(score));
  Game.mode='over';Snd.on=false;$('btnPause').hidden=true;$('pads').classList.remove('on');
  setTimeout(()=>{
    if(Game.mode!=='over')return;
    if(document.pointerLockElement)document.exitPointerLock();
    $('overTitle').textContent=title;$('overEye').textContent=eye;$('stamp').hidden=!nb;
    const t=$('tally');t.innerHTML='';for(const[k,v]of rows){const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=k;b.textContent=v;t.append(a,b)}
    $('over').hidden=false;$('again').focus({preventScroll:true});
  },delay);
}
$('btnPause').addEventListener('click',()=>setPause(inPlay()));
$('btnMute').addEventListener('click',()=>Snd.setMute(!Snd.muted));
$('resume').addEventListener('click',()=>setPause(false));
$('quit').addEventListener('click',toTitle);$('quit2').addEventListener('click',toTitle);
$('again').addEventListener('click',beginRun);$('start').addEventListener('click',beginRun);

/* 주 루프 */
function step(raw){
  T.ui+=raw;
  if(Game.mode==='pause')return;
  T.trauma=max(0,T.trauma-raw*1.6);
  if(T.stop>0){T.stop-=raw;return}
  if(T.hold>0)T.hold-=raw;else T.ts=damp(T.ts,1,5,raw);
  const dt=raw*T.ts;
  Hooks.update(dt,raw);
  fxA.update(dt);fxS.update(dt);updChunks(dt,Hooks.floorY||0);updRings(dt);updFlashes(dt);
}
const sv=new V();let se=0;
function draw(){
  const t=T.trauma*T.trauma,u=T.ui;
  sv.copy(cam.position);const rz=cam.rotation.z;
  if(t>0){cam.position.x+=sin(u*71)*t*.7;cam.position.y+=sin(u*83+1)*t*.7;cam.rotation.z+=sin(u*57)*t*.04}
  R.render(scene,cam);
  cam.position.copy(sv);cam.rotation.z=rz;
}
let last=performance.now(),slowT=0;
function frame(now){
  requestAnimationFrame(frame);
  const real=(now-last)/1000,raw=clamp(real,0,.05);last=now;
  if(inPlay()&&real<.5){slowT=real>1/38?slowT+real:max(0,slowT-real);if(slowT>2&&PR>.7){PR=max(.7,PR*.8);resize();slowT=0}}
  step(raw);draw();
}
function bootGame(key,hooks){
  Game.key=key;Hooks=hooks;Snd.setMute(Snd.muted);toTitle();
  if(DEBUG)window.__core={Game,T,In,Hooks,step,draw,beginRun,toTitle,setPause};
  requestAnimationFrame(frame);
}
