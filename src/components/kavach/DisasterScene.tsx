import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Html, Lightformer, Line, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { useKavach } from '@/lib/kavach/store';
import { localXY, type Props } from './MapCanvas';
import buildingA from '@/assets/trace-building-a.asset.json';
import buildingC from '@/assets/trace-building-c.asset.json';

export type SceneSelection = { kind: 'node'|'zone'|'signal'; id: string } | null;
type Palette = Record<'sky'|'ground'|'grid'|'concrete'|'metal'|'water'|'primary'|'warning'|'critical'|'info'|'success', string>;
function palette(): Palette {
  const styles=getComputedStyle(document.documentElement);
  return Object.fromEntries(['sky','ground','grid','concrete','metal','water','primary','warning','critical','info','success'].map(key=>[key,styles.getPropertyValue(`--scene-${key}`).trim()])) as Palette;
}
function Building({url,position,tilt=0}:{url:string;position:[number,number,number];tilt?:number}) {
  const {scene}=useGLTF(url);
  const object=useMemo(()=>{
    const clone=scene.clone(true);
    const box=new THREE.Box3().setFromObject(clone);const size=box.getSize(new THREE.Vector3());
    clone.scale.setScalar(7/Math.max(size.x,size.y,size.z,1));
    const bounds=new THREE.Box3().setFromObject(clone);const centre=bounds.getCenter(new THREE.Vector3());
    clone.position.set(-centre.x,-bounds.min.y,-centre.z);
    clone.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    return clone;
  },[scene]);
  return <group position={position} rotation={[tilt,.35,0]}><primitive object={object}/></group>;
}
function Terrain({colors}:{colors:Palette}) {
  const k=useKavach();
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.fillStyle=colors.ground;ctx.fillRect(0,0,256,256);
    for(let i=0;i<950;i++){ctx.fillStyle=i%3===0?colors.concrete:colors.grid;ctx.globalAlpha=.12;ctx.fillRect((i*71)%256,(i*43)%256,2,2);}
    ctx.globalAlpha=.65;ctx.strokeStyle=colors.grid;ctx.lineWidth=1;
    for(let i=0;i<256;i+=32){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(4,4);return t;
  },[colors]);
  useEffect(()=>()=>texture?.dispose(),[texture]);
  return <>
    <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[52,52]}/><meshStandardMaterial map={texture} color={colors.ground} roughness={.94}/></mesh>
    <mesh position={[0,.015,5]} rotation-x={-Math.PI/2}><planeGeometry args={[49,3]}/><meshStandardMaterial color={colors.metal} roughness={.85}/></mesh>
    {Array.from({length:14},(_,i)=><mesh key={i} position={[-24+i*3.7,.04,5]} rotation-x={-Math.PI/2}><planeGeometry args={[1.4,.08]}/><meshBasicMaterial color={colors.concrete}/></mesh>)}
    <Suspense fallback={<Html center><span className="trace-label text-primary">Loading environment…</span></Html>}>
      <Building url={buildingA.url} position={[-8,0,-6]} tilt={k.scenario==='collapse'?.18:0}/>
      <Building url={buildingC.url} position={[8,0,7]} tilt={k.scenario==='collapse'?-.12:0}/>
      <Building url={buildingA.url} position={[-12,0,12]}/>
    </Suspense>
    {k.scenario==='collapse'&&Array.from({length:24},(_,i)=><mesh key={i} position={[-6+(i*3.1)%12,.18+(i%3)*.1,-3+(i*2.7)%7]} rotation={[i*.8,i*.42,i*.15]} castShadow><boxGeometry args={[.6+(i%4)*.3,.4,.6]}/><meshStandardMaterial color={i%3===0?colors.metal:colors.concrete} roughness={.95}/></mesh>)}
    {k.scenario==='flood'&&<mesh position={[0,.3,-1]} rotation-x={-Math.PI/2}><planeGeometry args={[30,18]}/><meshPhysicalMaterial color={colors.water} transparent opacity={.72} roughness={.18} metalness={.3}/></mesh>}
    {k.scenario==='industrial'&&Array.from({length:4},(_,i)=><mesh key={i} position={[3+i*2,1.8,-8]} castShadow><cylinderGeometry args={[.9,.9,3.6,16]}/><meshStandardMaterial color={colors.metal} metalness={.65} roughness={.4}/></mesh>)}
    <Html position={[-8,.25,-12]} center><span className="trace-label whitespace-nowrap">{k.scenario==='collapse'?'COLLAPSED SECTOR A':k.scenario==='flood'?'INUNDATED SECTOR A':'METAL OBSTRUCTION A'}</span></Html>
  </>;
}
function Packet({from,to,color,active}:{from:THREE.Vector3;to:THREE.Vector3;color:string;active:boolean}){
  const mesh=useRef<THREE.Mesh>(null);const t=useRef(0);
  useFrame((_,delta)=>{if(!mesh.current||!active)return;t.current=(t.current+Math.min(delta,.05)*.3)%1;mesh.current.position.lerpVectors(from,to,t.current);});
  return active?<mesh ref={mesh} position={from}><sphereGeometry args={[.12,8,8]}/><meshBasicMaterial color={color}/></mesh>:null;
}
function Scan({radius,color,active}:{radius:number;color:string;active:boolean}){
  const mesh=useRef<THREE.Mesh>(null);
  useFrame((_,delta)=>{if(mesh.current&&active)mesh.current.rotation.z+=Math.min(delta,.05)*.5;});
  return <mesh ref={mesh} rotation-x={-Math.PI/2}><ringGeometry args={[.05,radius,48,1,0,.3]}/><meshBasicMaterial color={color} transparent opacity={.14} side={THREE.DoubleSide} depthWrite={false}/></mesh>;
}
function World({props,select,colors,reduced}:{props:Props;select:(s:SceneSelection)=>void;colors:Palette;reduced:boolean}){
  const k=useKavach();const gateway=props.nodes.find(n=>n.type==='gateway');
  const transport=k.gatewayConnected&&gateway?.status!=='offline';
  const coords=(n:{lat:number;lon:number},height=.7)=>{const xy=localXY(n);return new THREE.Vector3(xy.x/10,height,-xy.y/10);};
  return <>
    <color attach="background" args={[colors.sky]}/><fog attach="fog" args={[colors.sky,55,120]}/>
    <ambientLight intensity={.8}/><directionalLight position={[12,30,15]} intensity={2.4} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-28} shadow-camera-right={28} shadow-camera-top={28} shadow-camera-bottom={-28}/>
    <Environment resolution={128}><Lightformer intensity={1.5} position={[0,15,0]} rotation-x={Math.PI/2} scale={[40,40,1]}/><Lightformer intensity={1} color={colors.info} position={[-20,5,0]} rotation-y={Math.PI/2} scale={[20,10,1]}/></Environment>
    <Terrain colors={colors}/>
    {props.nodes.map(n=>{const pos=coords(n);const color=n.status==='offline'?colors.critical:n.type==='gateway'?colors.info:colors.primary;
      return <group key={n.id} position={pos} onClick={e=>{e.stopPropagation();select({kind:'node',id:n.id});props.onSelectNode?.(n.id);}}>
        <mesh castShadow><cylinderGeometry args={[n.type==='gateway'?.65:.35,.5,.75,6]}/><meshStandardMaterial color={colors.metal} metalness={.5} roughness={.35}/></mesh>
        <mesh position-y={.55}><cylinderGeometry args={[.06,.06,1,8]}/><meshStandardMaterial color={color}/></mesh>
        <mesh position-y={-.6} rotation-x={-Math.PI/2}><ringGeometry args={[.75,.88,32]}/><meshBasicMaterial color={color} side={THREE.DoubleSide}/></mesh>
        <Html position={[0,1.7,0]} center><Button size="sm" variant="outline" className="h-auto px-2 py-1 bg-card/90 text-[10px] mono-num whitespace-nowrap" aria-label={`Inspect 3D ${n.type==='gateway'?'gateway':'node'} ${n.id}`} onClick={()=>{select({kind:'node',id:n.id});props.onSelectNode?.(n.id);}}>{n.id} · {n.type==='gateway'?(k.mode==='simulation'?'SIMULATED GATEWAY':'GATEWAY'):n.status.toUpperCase()}</Button></Html>
      </group>;
    })}
    {gateway&&props.nodes.filter(n=>n.id!==gateway.id).map(n=>{const from=coords(n,.5),to=coords(gateway,.5);const active=transport&&n.status!=='offline';return <group key={`link-${n.id}`}><Line points={[from,to]} color={active?colors.primary:colors.critical} transparent opacity={.45} dashed dashSize={.4} gapSize={.3} lineWidth={1}/><Packet from={from} to={to} color={colors.primary} active={active&&k.running&&!reduced}/></group>;})}
    {props.zones.map(z=><group key={z.id} position={coords(z,.16)} onClick={e=>{e.stopPropagation();select({kind:'zone',id:z.id});}}>
      <mesh rotation-x={-Math.PI/2}><circleGeometry args={[z.radius/10,64]}/><meshBasicMaterial color={colors.warning} transparent opacity={.09} side={THREE.DoubleSide} depthWrite={false}/></mesh>
      <mesh rotation-x={-Math.PI/2}><ringGeometry args={[z.radius/10-.05,z.radius/10+.05,64]}/><meshBasicMaterial color={colors.warning} side={THREE.DoubleSide}/></mesh>
      <Scan radius={z.radius/10} color={colors.warning} active={k.running&&!reduced}/>
      <Html position={[0,2,0]} center><Button variant="outline" size="sm" className="border-warning/60 bg-card/90 text-warning h-auto py-1 px-2 text-[10px] whitespace-nowrap" aria-label={`Inspect 3D zone ${z.id}`} onClick={()=>select({kind:'zone',id:z.id})}>{z.id} · ±{z.radius} m · {z.confidence}% HEURISTIC</Button></Html>
    </group>)}
    {props.showTruth&&k.mode==='simulation'&&k.signal&&<group position={[k.signal.x/10,.5,-k.signal.y/10]} onClick={e=>{e.stopPropagation();select({kind:'signal',id:k.signal?.id??'SYN-01'});}}><mesh><octahedronGeometry args={[.35]}/><meshBasicMaterial color={colors.success}/></mesh><Html position={[0,1,0]} center><Button variant="outline" size="sm" className="h-auto px-2 py-1 text-[10px] text-success whitespace-nowrap" aria-label="Inspect synthetic signal" onClick={()=>select({kind:'signal',id:k.signal?.id??'SYN-01'})}>SYNTHETIC GROUND TRUTH</Button></Html></group>}
    <OrbitControls makeDefault target={[0,0,0]} minDistance={18} maxDistance={85} maxPolarAngle={Math.PI/2.15} enableDamping={!reduced}/>
  </>;
}
export default function DisasterScene({props,select,reset}:{props:Props;select:(s:SceneSelection)=>void;reset:number}){
  const colors=useMemo(palette,[]);const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
  return <Canvas key={reset} shadows dpr={[1,1.5]} camera={{position:[32,33,39],fov:48,near:.1,far:180}} frameloop={reduced?'demand':'always'} onPointerMissed={()=>select(null)} aria-label="Interactive TRACE 3D disaster scene"><World props={props} select={select} colors={colors} reduced={reduced}/></Canvas>;
}