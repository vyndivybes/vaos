/** Safe client microphone diagnostics — cannot grant VAOS authorization.
 * Microphone capture is only tested after a user gesture. Tracks are stopped
 * immediately; audio is never recorded, stored or transmitted by VAOS.
 */
const STATUS=Object.freeze({
 READY:'Microphone ready. Select the mic or enable hands-free listening.',
 CHECKING:'Checking browser and VAOS microphone availability.',
 SESSION_REQUIRED:'VAOS voice session expired. Sign in again before using the microphone.',
 VOICE_CONTROL_DISABLED:'VAOS voice access is disabled for this account or deployment. Text questions remain available.',
 CAPABILITY_UNAVAILABLE:'VAOS voice qualification could not be read. Check network access and retry.',
 INSECURE_CONTEXT:'Microphone requires HTTPS or a secure browser context.',
 SPEECH_UNAVAILABLE:'Speech recognition is not available in this browser session. Try standard Chrome/Edge (not restricted remote debugging), or type using Windows Win + H.',
 PERMISSION_DENIED:'Microphone permission is blocked. Use the Chrome site controls beside the address bar → Site settings → Microphone → Allow, then reload.',
 NO_DEVICE:'No microphone was found. Connect or enable an input device in Windows Sound settings.',
 DEVICE_BUSY:'The microphone is unavailable or is already in use. Close other recording apps, then retry.',
 PERMISSION_UNKNOWN:'Browser microphone access could not be verified. Use Check microphone again.',
});
export function getMicrophoneReadiness({capability='loading',recognitionAvailable=false,
 secureContext=true,permission='unknown'}={}){
 let code='READY';
 if(capability==='loading')code='CHECKING';
 else if(capability==='unauthenticated')code='SESSION_REQUIRED';
 else if(capability==='disabled')code='VOICE_CONTROL_DISABLED';
 else if(capability!=='enabled')code='CAPABILITY_UNAVAILABLE';
 else if(!secureContext)code='INSECURE_CONTEXT';
 else if(!recognitionAvailable)code='SPEECH_UNAVAILABLE';
 else if(permission==='denied')code='PERMISSION_DENIED';
 else if(permission==='no-device')code='NO_DEVICE';
 else if(permission==='busy')code='DEVICE_BUSY';
 else if(permission==='unavailable')code='PERMISSION_UNKNOWN';
 return Object.freeze({code,message:STATUS[code],mayListen:code==='READY',
  canProbe:capability==='enabled'&&secureContext===true&&recognitionAvailable===true});
}
export async function probeMicrophonePermission({mediaDevices}={}){
 if(typeof mediaDevices?.getUserMedia!=='function')return 'unsupported';
 let stream;
 try{
  stream=await mediaDevices.getUserMedia({audio:true,video:false});
  return 'granted';
 }catch(error){
  const type=error?.name;
  if(type==='NotAllowedError'||type==='PermissionDeniedError'||type==='SecurityError')return 'denied';
  if(type==='NotFoundError'||type==='DevicesNotFoundError')return 'no-device';
  if(type==='NotReadableError'||type==='TrackStartError'||type==='AbortError')return 'busy';
  return 'unavailable';
 }finally{
  try{for(const track of stream?.getTracks?.()||[])track.stop?.();}catch{}
 }
}
