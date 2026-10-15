// Explicit founder intents only. No AI-produced command is trusted as an authorized write.
export function resolveFounderGoogleIntent(input,now=new Date()){
 const q=typeof input==='string'?input.trim():'';
 if(q.length<5||q.length>300)return null;
 if(/\b(?:mail|emails?|inbox|messages?)\b/i.test(q) &&
    /\b(?:any|check|find|search|show|read|summarize|latest|new|received|what|did|have|tell)\b/i.test(q)){
  const from=q.match(/\bfrom\s+([a-z0-9][a-z0-9 .@_-]{1,65}?)(?:\s*(?:\?|$|today\b|recently\b|this week\b))/i);
  const term=from?.[1]?.trim()||q.match(/\b(?:about|regarding)\s+([a-z0-9][a-z0-9 ._-]{1,65})/i)?.[1]?.trim();
  return {kind:'MAIL',query:term?'from:'+term.replace(/\s+/g,' ').slice(0,65):'newer_than:30d'};
 }
 if(!/\b(?:remind me|set (?:a |an )?reminder|schedule|add (?:to|a|an) (?:my )?calendar|book (?:a |an )?meeting)\b/i.test(q))return null;
 const match=q.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
 const relative=q.match(/\b(tomorrow|today)\b/i);
 const weekday=q.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
 const time=q.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
   ||q.match(/\b(?:at\s+)(\d{1,2}):(\d{2})\b/i);
 const hour=time?Number(time[1])+(time[3]?(time[3].toLowerCase()==='pm'&&Number(time[1])!==12?12:time[3].toLowerCase()==='am'&&Number(time[1])===12?-12:0):0):NaN;
 const minutes=time?Number(time[2]||0):NaN;
 if(!Number.isInteger(hour)||hour>23||hour<0||minutes>59)return {kind:'NEED_TIME',message:'What time should I set it for? Please say a date and time, such as tomorrow at 9 AM.'};
 let date=null;
 if(match)date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),hour,minutes);
 else if(relative){date=new Date(now);date.setDate(date.getDate()+(relative[1].toLowerCase()==='tomorrow'?1:0));date.setHours(hour,minutes,0,0)}
 else if(weekday){const names=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];date=new Date(now);let shift=(names.indexOf(weekday[1].toLowerCase())-date.getDay()+7)%7;if(shift===0)shift=7;date.setDate(date.getDate()+shift);date.setHours(hour,minutes,0,0)}
 if(!date||!Number.isFinite(date.getTime())||date.getTime()<now.getTime()+60000||date.getTime()>now.getTime()+365*86400000)return {kind:'NEED_TIME',message:'Please specify a future date and time, such as Monday at 9 AM or 2026-10-19 at 09:00.'};
 if(match&&(date.getFullYear()!==Number(match[1])||date.getMonth()!==Number(match[2])-1||date.getDate()!==Number(match[3])))return {kind:'NEED_TIME',message:'That calendar date is invalid. Please give a valid date and time.'};
 let title=q.replace(/^\s*(?:jarvis[,\s]*)?/i,'').replace(/^(?:please\s+)?(?:remind me to|set (?:a |an )?reminder to|schedule|add (?:to|a|an) (?:my )?calendar|book (?:a |an )?meeting)\s*/i,'').trim();
 title=title.replace(/\b(?:on\s+)?20\d{2}-\d{2}-\d{2}\b/gi,'').replace(/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,'').replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,'').replace(/\b(?:at\s+)\d{1,2}:\d{2}\b/gi,'').replace(/\s+/g,' ').trim().replace(/[.,]+$/,'');
 if(title.length<3)return {kind:'NEED_TITLE',message:'What should I call this reminder or meeting?'};
 const end=new Date(date.getTime()+30*60000);
 return {kind:'CALENDAR',title:title.slice(0,140),start:date.toISOString(),end:end.toISOString()};
}
