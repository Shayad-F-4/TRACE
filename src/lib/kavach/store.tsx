import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { buildEvidence, clamp, distanceToRssi, localize, makeRng, metresBetween, offsetMetres, priorityOf, rssiToDistance, scoreEvidence } from './engine';
import type { AlertItem, CalibrationSettings, Detection, LogEvent, SearchZone, SensorNode, TelemetryPacket } from './types';
export const SITE_ORIGIN = { lat: 19.8762, lon: 74.4785 };
export const DEFAULT_CALIBRATION: CalibrationSettings = { refRssi: -48, pathLossExponent: 2.7, minRadius: 8, maxRadius: 120 };
export interface Incident { id: string; name: string; disaster: string; location: string; commander: string; notes: string; status: 'active'|'paused'|'closed'; created: number; timeline: string[] }
export interface SimSignal { id: string; x: number; y: number; strength: number; path: 'stationary'|'east-west'|'orbit'; kind: 'survivor'|'noise' }
export interface Sample { tick: number; time: string; detections: number; rssi: number; online: number; battery: number; received: number; lost: number; confidence: number; radius: number; error: number | null }
export type SceneScenario = 'collapse'|'flood'|'industrial';
interface State { sceneMode: '2d'|'3d'; scenario: SceneScenario; running: boolean; mode: 'simulation'|'live'; bootstrapped: boolean; nodes: SensorNode[]; detections: Detection[]; zones: SearchZone[]; alerts: AlertItem[]; logs: LogEvent[]; calibration: CalibrationSettings; tick: number; rate: number; noise: number; obstruction: number; expiry: number; signal: SimSignal | null; samples: Sample[]; incidents: Incident[]; incidentId: string; gatewayConnected: boolean; apiUrl: string; apiStatus: string; apiTimestamp: number | null }
interface Api extends State { setSceneMode:(mode:'2d'|'3d')=>void; setScenario:(scenario:SceneScenario)=>void; start:()=>void; pause:()=>void; stop:()=>void; reset:()=>void; step:()=>void; setMode:(m:'simulation'|'live')=>void; setCalibration:(c:CalibrationSettings)=>void; generateSurvivor:()=>void; generateFalsePositive:()=>void; simulateNodeFailure:()=>void; acknowledge:(id:string)=>void; ingestPacket:(p:TelemetryPacket)=>void; configure:(c:Partial<Pick<State,'rate'|'noise'|'obstruction'|'expiry'|'apiUrl'|'apiStatus'|'apiTimestamp'>>)=>void; updateNode:(id:string,c:Partial<SensorNode>)=>void; addNode:()=>void; deleteNode:(id:string)=>void; moveNode:(id:string,x:number,y:number)=>void; setSignal:(c:Partial<SimSignal>)=>void; removeSignal:()=>void; setGateway:(v:boolean)=>void; selectIncident:(id:string)=>void; createIncident:(c:Omit<Incident,'id'|'created'|'timeline'>)=>void; updateIncident:(id:string,c:Partial<Incident>)=>void; guidedDemo:()=>void }
let sequence = 0;
const uid = (prefix:string) => `${prefix}-${++sequence}`;
function seedNodes():SensorNode[] { return [ [-120,90], [130,105], [145,-110], [-135,-95] ].map(([x,y],i)=>({ id:`N0${i+1}`, label:['Northwest perimeter','Stairwell / Sector B','Parking slab / Sector C','Command gateway'][i] ?? 'Sensor', ...offsetMetres(SITE_ORIGIN,x ?? 0,y ?? 0), type:i===3?'gateway':'sniffer', status:'online', battery:[88,76,64,93][i] ?? 80, sound:34+i, vibration:.04, temperature:27.4+i*.3, bleDetected:0,wifiDetected:0,rssi:-95,loraRssi:-72-i*4,loraSnr:9.5-i*1.2,lastPacket:0,sensorHealth:{gps:'ok',mic:'ok',vibration:'ok',thermal:'ok',lora:'ok'}, hops:i===3?0:1,firmware:'trace-demo 1.0',uptime:0,packetsReceived:0,packetsLost:0 })); }
function initial():State { return { sceneMode:'3d',scenario:'collapse',running:true,mode:'simulation',bootstrapped:true,nodes:seedNodes(),detections:[],zones:[],alerts:[],logs:[],calibration:DEFAULT_CALIBRATION,tick:0,rate:2500,noise:2,obstruction:0,expiry:30,signal:{id:'SYN-01',x:20,y:15,strength:0,path:'stationary',kind:'survivor'},samples:[],incidents:[{id:'INC-001',name:'Kopargaon · Sector Delta',disaster:'Structural collapse',location:'Kopargaon, Maharashtra',commander:'Demo operator',notes:'Synthetic training exercise. No field deployment.',status:'active',created:0,timeline:['Training incident created']}],incidentId:'INC-001',gatewayConnected:true,apiUrl:'',apiStatus:'Not configured',apiTimestamp:null }; }
const Ctx = createContext<Api|null>(null);
export function KavachProvider({children}:{children:ReactNode}) {
  const [state,setState] = useState<State>(initial);
  const rng = useRef(makeRng(20261012));
  const liveCache = useRef<Pick<State,'nodes'|'detections'|'zones'|'logs'|'alerts'|'samples'|'tick'|'gatewayConnected'>|null>(null);
  const simCache = useRef<State|null>(null);
  const log = (s:State, level:LogEvent['level'], source:string, message:string) => { s.logs = [{id:uid('evt'),ts:Date.now(),level,source,message},...s.logs].slice(0,400); };
  const alert = (s:State,title:string,reason:string,target:string) => { if(s.alerts.some(a=>a.target===target&&!a.acknowledged))return; const item:AlertItem={id:uid('alert'),ts:Date.now(),kind:target.startsWith('N')?'node':'zone',severity:'warning',title,reason,target,acknowledged:false};s.alerts=[item,...s.alerts].slice(0,100); };
  const advance = (prev:State,recalculate=false):State => {
    if(prev.mode!=='simulation')return prev;
    const s = {...prev,nodes:prev.nodes.map(n=>({...n})),logs:[...prev.logs],alerts:[...prev.alerts],tick:prev.tick+(recalculate?0:1)};
    const now=Date.now(), random=recalculate?makeRng(20261012):rng.current, jitter=(v:number)=>(random()-.5)*2*v;
    let source=s.signal;
    if(!recalculate&&source&&source.path!=='stationary') { const t=s.tick*.035; source={...source,x:source.path==='orbit'?Math.cos(t)*65:Math.sin(t)*100,y:source.path==='orbit'?Math.sin(t)*65:source.y}; s.signal=source; }
    const position=source?offsetMetres(SITE_ORIGIN,source.x,source.y):null;
    const transport=s.gatewayConnected&&s.nodes.some(n=>n.type==='gateway'&&n.status!=='offline');
    const observations: Parameters<typeof localize>[0]=[];
    const fresh:Detection[]=[];
    for(const n of s.nodes) {
      if(n.status==='offline'){if(!recalculate)n.packetsLost=(n.packetsLost??0)+1;continue;}
      if(!recalculate){n.lastPacket=now; n.uptime=(n.uptime??0)+s.rate/1000; n.battery=clamp(n.battery-.005,0,100);}
      n.loraRssi=clamp(-72-Number(n.id.slice(1))*2+jitter(2),-120,-55); n.loraSnr=8+jitter(1);
      if(!recalculate){n.packetsReceived=(n.packetsReceived??0)+(transport?1:0); n.packetsLost=(n.packetsLost??0)+(transport?0:1);}
      n.sound=clamp(34+jitter(2)+(source?.kind==='survivor'?15:0),30,95); n.vibration=.04+(source?.kind==='survivor'?.18:Math.abs(jitter(.06))); n.temperature=27.4+(source?.kind==='survivor'?3:0)+jitter(.3);
      n.bleDetected=position&&n.type!=='gateway'?1:0; n.wifiDetected=0;
      if(position&&source&&n.type!=='gateway'){
        n.rssi=clamp(distanceToRssi(metresBetween(n,position),s.calibration)+source.strength-s.obstruction+jitter(s.noise+(source.kind==='noise'?8:0)),-125,-35);
        const history=(recalculate?[]:prev.detections).filter(d=>d.nodeId===n.id&&now-d.ts<s.expiry*1000).slice(0,5);
        const values=[n.rssi,...history.map(d=>d.rssi)]; const mean=values.reduce((a,b)=>a+b,0)/values.length; const variance=values.reduce((a,b)=>a+(b-mean)**2,0)/values.length;
        if(transport) observations.push({nodeId:n.id,lat:n.lat,lon:n.lon,rssi:mean,variance,age:0});
        if(transport)fresh.push({id:uid('obs'),ts:now,nodeId:n.id,signalType:source.kind==='noise'?'Wi-Fi':'BLE',tempId:source.id,rssi:Math.round(n.rssi),distance:Math.round(rssiToDistance(n.rssi,s.calibration)),persistence:source.kind==='noise'?.3:.85,status:'tracking'});
      }else n.rssi=-96+jitter(3);
      if(n.battery<20)alert(s,'Low battery',`${n.id} requires a battery check`,n.id);
    }
    s.detections=[...fresh,...(recalculate?prev.detections.map(d=>({...d,status:'lost' as const})):prev.detections)].slice(0,600).map(d=>({...d,status:now-d.ts>s.expiry*1000?'lost':d.status}));
    const fix=source?localize(observations,s.calibration):null;
    if(fix){ const evidence=buildEvidence(s.nodes.filter(n=>n.type!=='gateway'),source?.kind==='noise'?.3:.85); const score=scoreEvidence(evidence); s.zones=[{id:'ZONE-01',ts:now,lat:fix.lat,lon:fix.lon,radius:Math.round(fix.radius),score,priority:priorityOf(score),evidence,contributingNodes:fix.nodes,note:'Potential search zone · supporting evidence only',confidence:fix.confidence,residual:fix.residual}]; log(s,'info','ESTIMATOR',`Potential search zone updated · heuristic ${fix.confidence}% · radius ±${Math.round(fix.radius)} m`); }
    else { s.zones=[]; if(source)log(s,'warn','ESTIMATOR',transport?'Insufficient node observations':'Gateway disconnected · observations unavailable'); }
    if(fresh.length)log(s,'info',source?.id??'RADIO',`Signal source detected · ${fresh.length} anonymous synthetic observations`);
    const online=s.nodes.filter(n=>n.status!=='offline');
    s.samples=[...(recalculate?prev.samples.slice(0,-1):prev.samples),{tick:s.tick,time:new Date(now).toLocaleTimeString('en-GB'),detections:fresh.length,rssi:online.reduce((a,n)=>a+n.rssi,0)/Math.max(1,online.length),online:online.length,battery:s.nodes.reduce((a,n)=>a+n.battery,0)/Math.max(1,s.nodes.length),received:s.nodes.reduce((a,n)=>a+(n.packetsReceived??0),0),lost:s.nodes.reduce((a,n)=>a+(n.packetsLost??0),0),confidence:fix?.confidence??0,radius:fix?.radius??0,error:fix&&position?metresBetween(fix,position):null}].slice(-120);
    return s;
  };
  const advanceRef=useRef(advance); advanceRef.current=advance;
  useEffect(()=>{setState(p=>advanceRef.current(p));},[]);
  useEffect(()=>{if(!state.running||state.mode!=='simulation')return; const timer=setInterval(()=>setState(p=>advanceRef.current(p)),state.rate);return()=>clearInterval(timer);},[state.running,state.mode,state.rate]);
  const mutate=(f:(s:State)=>void)=>setState(p=>{const s={...p,nodes:p.nodes.map(n=>({...n})),logs:[...p.logs],alerts:[...p.alerts]};f(s);const changed=s.mode==='simulation'&&(s.signal!==p.signal||s.calibration!==p.calibration||s.noise!==p.noise||s.obstruction!==p.obstruction||s.expiry!==p.expiry||s.gatewayConnected!==p.gatewayConnected||JSON.stringify(s.nodes)!==JSON.stringify(p.nodes));return changed?advanceRef.current(s,true):s;});
  const setSignal=(c:Partial<SimSignal>)=>mutate(s=>{if(s.mode!=='simulation')return;s.signal={id:'SYN-01',x:20,y:15,strength:0,path:'stationary',kind:'survivor',...s.signal,...c};log(s,'info','SIM','Synthetic signal configuration updated');});
  const api:Api={...state,
    setSceneMode:sceneMode=>mutate(s=>{s.sceneMode=sceneMode;}),
    setScenario:scenario=>mutate(s=>{if(s.mode!=='simulation')return;s.scenario=scenario;s.noise=scenario==='industrial'?8:scenario==='flood'?4:2;s.obstruction=scenario==='industrial'?12:scenario==='flood'?4:0;log(s,'info','SIM',`${scenario} training environment selected`);}),
    start:()=>mutate(s=>{if(s.mode==='simulation'){s.running=true;log(s,'info','SIM','Simulation started');}}),
    pause:()=>mutate(s=>{s.running=false;log(s,'info','SIM','Simulation paused');}),
    stop:()=>mutate(s=>{s.running=false;s.signal=null;s.zones=[];log(s,'warn','SIM','Simulation stopped · source removed');}),
    reset:()=>{if(state.mode!=='simulation')return;rng.current=makeRng(20261012);setState(p=>advanceRef.current({...initial(),running:false,calibration:p.calibration,incidents:p.incidents,incidentId:p.incidentId,apiUrl:p.apiUrl}));},
    step:()=>setState(p=>advanceRef.current(p)),
    setMode:(mode)=>{if(mode===state.mode)return;if(mode==='live'){simCache.current=state;const saved=liveCache.current;setState(p=>({...p,mode,running:false,nodes:[],detections:[],zones:[],logs:[],alerts:[],samples:[],tick:0,gatewayConnected:false,...saved}));}else{liveCache.current={nodes:state.nodes,detections:state.detections,zones:state.zones,logs:state.logs,alerts:state.alerts,samples:state.samples,tick:state.tick,gatewayConnected:state.gatewayConnected};const saved=simCache.current;setState(p=>saved?{...saved,sceneMode:p.sceneMode,mode,apiUrl:p.apiUrl,apiStatus:p.apiStatus,apiTimestamp:p.apiTimestamp}:{...initial(),mode});}},
    setCalibration:(c)=>mutate(s=>{if(!Object.values(c).every(Number.isFinite))return;s.calibration={refRssi:clamp(c.refRssi,-100,-20),pathLossExponent:clamp(c.pathLossExponent,1,6),minRadius:clamp(c.minRadius,1,100),maxRadius:clamp(c.maxRadius,Math.max(1,c.minRadius),500)};}),
    configure:(c)=>mutate(s=>{Object.assign(s,c);s.rate=clamp(s.rate,500,10000);s.noise=clamp(s.noise,0,15);s.obstruction=clamp(s.obstruction,0,20);s.expiry=clamp(s.expiry,5,300);}),
    generateSurvivor:()=>{setSignal({kind:'survivor',x:20,y:15,path:'stationary'});mutate(s=>{if(s.mode==='simulation')s.running=true;});},
    generateFalsePositive:()=>{setSignal({kind:'noise'});mutate(s=>{if(s.mode==='simulation')s.running=true;});},
    guidedDemo:()=>{if(state.mode!=='simulation')return;rng.current=makeRng(20261012);setState(p=>advanceRef.current({...initial(),incidents:p.incidents,incidentId:p.incidentId,apiUrl:p.apiUrl}));},
    simulateNodeFailure:()=>{const n=state.nodes.find(n=>n.status==='online'&&n.type!=='gateway');if(n)api.updateNode(n.id,{status:'offline'});},
    acknowledge:(id)=>mutate(s=>{s.alerts=s.alerts.map(a=>a.id===id?{...a,acknowledged:true}:a);}),
    updateNode:(id,c)=>mutate(s=>{if(s.mode!=='simulation')return;const n=s.nodes.find(n=>n.id===id);if(!n)return;const before=n.status;Object.assign(n,c);if(n.type==='gateway')s.gatewayConnected=n.status!=='offline';if(before!==n.status){log(s,n.status==='offline'?'warn':'info',n.id,`Node heartbeat ${n.status==='offline'?'lost':'restored'} (simulated)`);if(n.status==='offline')alert(s,'Node heartbeat lost','Synthetic node offline',n.id);}}),
    moveNode:(id,x,y)=>api.updateNode(id,offsetMetres(SITE_ORIGIN,clamp(x,-240,240),clamp(y,-240,240))),
    addNode:()=>mutate(s=>{if(s.mode!=='simulation'||s.nodes.length>=10)return;let i=1;while(s.nodes.some(n=>n.id===`N${String(i).padStart(2,'0')}`))i++;const template=seedNodes()[0];if(template)s.nodes=[...s.nodes,{...template,id:`N${String(i).padStart(2,'0')}`,label:'Added simulated sniffer',...offsetMetres(SITE_ORIGIN,0,160),packetsReceived:0,packetsLost:0}];log(s,'info','SIM','Simulated sniffer added');}),
    deleteNode:(id)=>mutate(s=>{if(s.mode!=='simulation'||s.nodes.length<=3||s.nodes.find(n=>n.id===id)?.type==='gateway')return;s.nodes=s.nodes.filter(n=>n.id!==id);log(s,'warn','SIM',`${id} removed from scenario`);}),
    setSignal,removeSignal:()=>mutate(s=>{if(s.mode==='simulation'){s.signal=null;s.zones=[];log(s,'info','SIM','Synthetic source removed');}}),
    setGateway:(v)=>mutate(s=>{if(s.mode!=='simulation')return;s.gatewayConnected=v;s.nodes=s.nodes.map(n=>n.type==='gateway'?{...n,status:v?'online':'offline'}:n);log(s,v?'info':'critical','GATEWAY',`Gateway ${v?'restored':'disconnected'} (simulated)`);if(!v)alert(s,'Gateway disconnected','Observation transport unavailable','GATEWAY');}),
    selectIncident:(id)=>mutate(s=>{s.incidentId=id;}),
    createIncident:(c)=>mutate(s=>{const id=uid('INC');s.incidents=[...s.incidents,{...c,id,created:Date.now(),timeline:['Incident created']}];s.incidentId=id;log(s,'info',id,'Incident created in local session');}),
    updateIncident:(id,c)=>mutate(s=>{s.incidents=s.incidents.map(i=>i.id===id?{...i,...c,timeline:[...i.timeline,`${new Date().toLocaleTimeString('en-GB')} · ${c.status?`Incident ${c.status}`:'Incident details updated'}`]}:i);if(id===s.incidentId&&c.status&&c.status!=='active')s.running=false;log(s,'info',id,'Incident record updated');}),
    ingestPacket:(p)=>mutate(s=>{if(s.mode!=='live'||!Number.isFinite(p.rssi)||!Number.isFinite(p.timestamp)||Date.now()-p.timestamp>state.expiry*1000)return;let n=s.nodes.find(n=>n.id===p.nodeId);if(!n){const template=seedNodes()[0];if(!template)return;n={...template,id:p.nodeId,label:'Hardware telemetry node',firmware:'Reported externally'};s.nodes.push(n);}Object.assign(n,{lat:p.latitude,lon:p.longitude,sound:p.sound,vibration:p.vibration,temperature:p.temperature,bleDetected:p.bleDetected,wifiDetected:p.wifiDetected,rssi:p.rssi,battery:p.battery,lastPacket:p.timestamp,loraRssi:p.loraRssi,loraSnr:p.loraSnr,status:'online'});log(s,'info','API',`Hardware telemetry received from ${p.nodeId}`);})
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
export function useKavach(){const value=useContext(Ctx);if(!value)throw new Error('KavachProvider is required');return value;}
