/**
 * Palette and inputs for the optional conceptual factory renderer.
 * These are scenario labels, not live telemetry or measured dimensions.
 */
export const FACTORY_SPECTRUM=Object.freeze({
 UNVERIFIED:Object.freeze({label:'Unverified',hex:'#e5bb82'}),
 HOLD:Object.freeze({label:'HOLD',hex:'#e5a6af'}),
 SIMULATED_RUNNING:Object.freeze({label:'Simulated running',hex:'#55e0b8'}),
 SIMULATED_IDLE:Object.freeze({label:'Simulated idle',hex:'#73bfff'}),
 SIMULATED_FAULT:Object.freeze({label:'Simulated fault',hex:'#ff907d'})
});
export function factorySceneStations(stations){
 if(!Array.isArray(stations)||stations.length<1||stations.length>30)throw Error('Invalid conceptual factory stations');
 const ids=new Set();
 return stations.map(station=>{
  if(!station||typeof station.id!=='string'||!station.id.trim()||
     typeof station.label!=='string'||!station.label.trim())throw Error('Invalid conceptual station');
  if(ids.has(station.id))throw Error('Duplicate conceptual factory station');
  ids.add(station.id);
  if(!FACTORY_SPECTRUM[station.status])throw Error('Unsupported conceptual factory status');
  if(![station.x,station.y,station.z].every(Number.isFinite))throw Error('Invalid conceptual factory coordinate');
  if(Math.abs(station.x)>10||station.y<0||station.y>4||Math.abs(station.z)>10)throw Error('Out of bounds conceptual factory coordinate');
  return Object.freeze({...station,color:FACTORY_SPECTRUM[station.status].hex});
 });
}
