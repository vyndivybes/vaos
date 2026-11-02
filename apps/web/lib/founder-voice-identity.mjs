// A signed-in founder can be addressed as Sir. This is session recognition,
// not face recognition, speaker identification or authentication by biometrics.
export function founderLoginGreeting({email,hour=new Date().getHours()}={}){
 if(typeof email!=='string'||email.toLowerCase()!=='shyamsundhar1982@gmail.com')return '';
 const h=Number.isInteger(hour)&&hour>=0&&hour<=23?hour:12;
 const salutation=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
 return salutation+', Sir. Welcome back. What would you like to work on?';
}
