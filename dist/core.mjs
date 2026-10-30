import {pairAssignmentEvents,importAssignments as importEvents,eventTitle} from './pairing.mjs';
import {stepsFor,nextStep} from './guidance.mjs';
export const VERSION=1;
export const defaults={dailyHours:2,bufferDays:1,weekends:true,zone:'Europe/London'};
export const uid=()=>crypto.randomUUID();
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeURL=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
export function emptyData(){return {version:VERSION,tasks:[],deleted:{},settings:{...defaults}};}
export function estimateHours(type,words=0,difficulty=1){const base={essay:10,report:14,problem:6,coding:20,presentation:8,exam:24,other:8};let h=base[type]||8;if(words>0&&['essay','report'].includes(type))h=4+Number(words)/180;h=Math.ceil(h*Number(difficulty)*4)/4;return {hours:h,low:Math.round(h*.75*4)/4,high:Math.round(h*1.5*4)/4};}
export const remaining=t=>t.status==='completed'?0:Math.max(0,t.estimate-(t.logs||[]).reduce((a,l)=>a+l.hours,0));
export const progress=t=>t.status==='completed'?100:stepsFor(t).length?Math.round(stepsFor(t).filter(s=>s.done).length/stepsFor(t).length*100):Math.min(99,Math.round((t.estimate-remaining(t))/t.estimate*100));
export function dayKey(d=new Date(),zone='Europe/London'){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(d));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
export function localInput(iso,zone){if(!iso)return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso)).replace(' ','T');}
export function zonedISO(value,zone='Europe/London'){
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw Error('Use a full date and time.');
 const target=Date.parse(value+'Z');if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,16)!==value)throw Error('Invalid calendar date.');
 new Intl.DateTimeFormat('en',{timeZone:zone}).format();
 let guess=target;for(let i=0;i<4;i++){const shown=Date.parse(localInput(new Date(guess).toISOString(),zone)+'Z');const delta=target-shown;if(!delta)break;guess+=delta;}
 if(localInput(new Date(guess).toISOString(),zone)!==value)throw Error('That time does not exist in this time zone (clock change). Choose another time.');
 return new Date(guess).toISOString();
}
export function releaseTimestamp(t){return (t.pairedEvents||[]).find(e=>e.kind==='opens'&&t.given&&dayKey(e.at,t.zone)===t.given)?.at||'';}
export function repairAssignments(input){const result=pairAssignmentEvents(validateData(input));return {...result,data:validateData(result.data)};}
export function applyImports(existing,items){const result=importEvents(validateData(existing),validateData({...emptyData(),tasks:items}).tasks);return {...result,data:validateData(result.data)};}
export function assignmentWindow(t,now=Date.now()){
 const due=t.due?Date.parse(t.due):null;
 const release=releaseTimestamp(t);const given=release?Date.parse(release):t.given?Date.parse(zonedISO(t.given+'T00:00',t.zone)):null;
 const status=t.status==='completed'?'completed':given===null||due===null?'needs-dates':now>=due?'overdue':now<given?'upcoming':'active';
 return {given,due,status};
}
export function priority(t,settings,now=Date.now()){
 const w=assignmentWindow(t,now);if(['completed','needs-dates','upcoming'].includes(w.status))return 'low';
 if(w.status==='overdue')return 'high';const left=(w.due-now)/86400000,ratio=(w.due-now)/(w.due-w.given);
 return left<=2||ratio<=.25?'high':ratio<=.5?'medium':'low';
}
// Retained API for older integrations: there is no separate calculated start date.
export function suggestedStart(t){return t.given||'';}
export function validateData(data){
 if(!data||typeof data!=='object'||data.version!==1||!Array.isArray(data.tasks)||data.tasks.length>10000)throw Error('Expected a Module Planner v1 backup with no more than 10,000 assignments.');
 const seen=new Set();const tasks=data.tasks.map(t=>{
  if(!t||typeof t.title!=='string'||!t.title.trim()||t.title.length>200||typeof t.module!=='string'||!t.module.trim()||t.module.length>120)throw Error('Every assignment needs a title and module.');
  if(typeof t.id!=='string'||!t.id||t.id.length>300||seen.has(t.id))throw Error('Assignment IDs must be unique.');seen.add(t.id);
  const num=Number(t.estimate);if(!Number.isFinite(num)||num<.25||num>10000)throw Error('Estimated hours must be between 0.25 and 10,000.');
  if(t.due&&(!Number.isFinite(Date.parse(t.due))||!/(Z|[+-]\d\d:\d\d)$/.test(t.due)))throw Error('Deadlines must include a time zone offset.');
  const zone=t.zone||defaults.zone;new Intl.DateTimeFormat('en',{timeZone:zone}).format();
  const given=t.given||'';if(given){if(!/^\d{4}-\d\d-\d\d$/.test(given))throw Error('Date given must be YYYY-MM-DD.');zonedISO(given+'T00:00',zone);if(t.due&&given>dayKey(t.due,zone))throw Error('The date given cannot be after the assignment deadline.');if(t.due&&Date.parse(zonedISO(given+'T00:00',zone))===Date.parse(t.due))throw Error('Deadline must be later than the start of the given date.');}
  const cleanLinks=list=>(Array.isArray(list)?list:[]).slice(0,30).filter(l=>l&&safeURL(l.url)).map(l=>({label:String(l.label||l.url).slice(0,200),url:safeURL(l.url)}));
  const strings=list=>[...new Set((Array.isArray(list)?list:[]).filter(v=>typeof v==='string'&&v&&v.length<=500))].slice(0,1000);
  const pairedEvents=(Array.isArray(t.pairedEvents)?t.pairedEvents:[]).slice(0,100).map(e=>{if(!e||!['opens','closes'].includes(e.kind)||!e.id||typeof e.id!=='string'||!Number.isFinite(Date.parse(e.at)))throw Error('Invalid opens/closes event metadata.');return {id:e.id.slice(0,300),kind:e.kind,at:new Date(e.at).toISOString(),title:String(e.title||'').slice(0,200),source:safeURL(e.source),...(e.importKey?{importKey:String(e.importKey).slice(0,500)}:{})};});
  const actualRelease=pairedEvents.find(e=>e.kind==='opens'&&given&&dayKey(e.at,zone)===given)?.at;if(t.due&&actualRelease&&Date.parse(actualRelease)>=Date.parse(t.due))throw Error('The deadline must be after the release time recorded by the opens event.');
  const steps=(t.steps||[]).map((s,i)=>{if(!s||typeof s.text!=='string'||s.text.length>500)throw Error('Invalid checklist item.');return {id:typeof s.id==='string'?s.id:'step-'+i,text:s.text,done:!!s.done,...(s.detail?{detail:String(s.detail).slice(0,3000)}:{}),...(s.links?{links:cleanLinks(s.links)}:{})};});
  const logs=(t.logs||[]).map(l=>{if(!l||!Number.isFinite(Number(l.hours))||l.hours<=0||l.hours>10000||!Number.isFinite(Date.parse(l.at)))throw Error('Invalid study log.');return {id:l.id||uid(),hours:Number(l.hours),at:l.at};});
  return {id:t.id,title:t.title.trim(),module:t.module.trim(),given,...(pairedEvents.length?{pairedEvents}:{}),...(t.importKeys?.length?{importKeys:strings(t.importKeys)}:{}),...(t.mergedIds?.length?{mergedIds:strings(t.mergedIds)}:{}),resources:cleanLinks(t.resources),due:t.due?new Date(t.due).toISOString():'',zone,type:['essay','report','problem','coding','presentation','exam','other'].includes(t.type)?t.type:'other',estimate:num,words:Math.max(0,Number(t.words)||0),difficulty:[.75,1,1.5].includes(Number(t.difficulty))?Number(t.difficulty):1,weight:t.weight==null||t.weight===''?'':Math.min(100,Math.max(0,Number(t.weight)||0)),priority:['auto','high','medium','low'].includes(t.priority)?t.priority:'auto',status:['not-started','in-progress','completed'].includes(t.status)?t.status:'not-started',source:safeURL(t.source),notes:String(t.notes||'').slice(0,20000),steps,logs,updatedAt:Number.isFinite(Date.parse(t.updatedAt))?t.updatedAt:new Date().toISOString(),...(t.importKey?{importKey:String(t.importKey).slice(0,500)}:{})};
 });
 const s=data.settings||{};const settings={dailyHours:Math.min(16,Math.max(.25,Number(s.dailyHours)||2)),bufferDays:Math.min(14,Math.max(0,Number(s.bufferDays??1))),weekends:s.weekends!==false,zone:s.zone||defaults.zone};
 new Intl.DateTimeFormat('en',{timeZone:settings.zone}).format();const deleted={};for(const [id,at] of Object.entries(data.deleted||{})){if(typeof at==='string'&&Number.isFinite(Date.parse(at)))deleted[id]=at;}
 return {version:1,tasks,settings,deleted};
}
const addDay=(key,n=1)=>{const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export function planStudy(data,now=new Date(),horizon=14){
 const time=Number(now),zone=data.settings.zone,today=dayKey(now,zone);
 const days=Array.from({length:horizon},(_,i)=>({date:addDay(today,i),blocks:[],capacity:0}));
 const byDate=new Map(days.map(d=>[d.date,d]));const warnings=[],needsDates=[],overdue=[],unallocated=[];
 const tasks=data.tasks.filter(t=>t.status!=='completed').sort((a,b)=>(Date.parse(a.due)||Infinity)-(Date.parse(b.due)||Infinity));
 for(const t of tasks){
  const w=assignmentWindow(t,time);if(w.status==='needs-dates'){needsDates.push(t);continue;}if(w.status==='overdue'){overdue.push(t);continue;}
  const begin=Math.max(time,w.given),rem=remaining(t);const first=dayKey(begin,t.zone);let last=dayKey(w.due,t.zone);
  if(Date.parse(zonedISO(last+'T00:00',t.zone))===w.due)last=addDay(last,-1);
  const totalDays=Math.max(1,Math.round((Date.parse(last+'T12:00:00Z')-Date.parse(first+'T12:00:00Z'))/86400000)+1);
  const pending=stepsFor(t).filter(s=>!s.done);if(!pending.length)pending.push(nextStep(t));
  if(rem>(w.due-begin)/3600000)warnings.push(`${t.title}: the remaining estimate exceeds the entire time left before the deadline. Review the estimate and seek support if needed.`);
  let allocated=0;
  for(let i=0;i<Math.min(totalDays,horizon+2);i++){
   const date=addDay(first,i),start=Math.max(begin,Date.parse(zonedISO(date+'T00:00',t.zone))),end=Math.min(w.due,Date.parse(zonedISO(addDay(date)+'T00:00',t.zone)));
   if(end<=start)continue;const row=byDate.get(dayKey(start,zone));if(!row)continue;
   const items=[];for(let j=0;j<pending.length;j++){const share=Math.min((i+1)/totalDays,(j+1)/pending.length)-Math.max(i/totalDays,j/pending.length);if(share>1e-12)items.push({step:pending[j],hours:rem*share,continued:i/totalDays>j/pending.length});}
   const h=items.reduce((sum,item)=>sum+item.hours,0);allocated+=h;
   row.blocks.push({task:t,hours:h,items,start:new Date(start).toISOString(),end:new Date(end).toISOString(),late:false});
   if(h>(end-start)/3600000)warnings.push(`${t.title} on ${date}: the estimated work is longer than the available window. This is a workload warning, not an extension of your deadline.`);
   if(rem===0)break;
  }
  if(rem-allocated>.001)unallocated.push({task:t,hours:rem-allocated});
 }
 return {days,warnings,needsDates,overdue,unallocated};
}
function canonical(v){if(v===undefined)return 'undefined';if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
export function mergeData(local,remote,base=null){
 const l=repairAssignments(local).data,r=repairAssignments(remote).data,b=base?repairAssignments(base).data:emptyData();const pick=(x,id)=>x.deleted[id]?{deleted:x.deleted[id]}:x.tasks.find(t=>t.id===id);const tasks=[],deleted={};
 for(const id of new Set([...l.tasks,...r.tasks,...b.tasks].map(t=>t.id).concat(Object.keys(l.deleted),Object.keys(r.deleted),Object.keys(b.deleted)))){
  const lv=pick(l,id),rv=pick(r,id),bv=pick(b,id);let value;
  if(canonical(lv)===canonical(rv))value=lv;else if(canonical(lv)===canonical(bv))value=rv;else if(canonical(rv)===canonical(bv))value=lv;else if(lv===undefined)value=rv;else if(rv===undefined)value=lv;else throw Error(`Conflict in “${lv?.title||rv?.title||'deleted assignment'}”. Export a backup before choosing which device’s version to keep.`);
  if(value?.deleted)deleted[id]=value.deleted;else if(value)tasks.push(value);
 }
 let settings;if(canonical(l.settings)===canonical(r.settings))settings=l.settings;else if(canonical(l.settings)===canonical(b.settings))settings=r.settings;else if(canonical(r.settings)===canonical(b.settings))settings=l.settings;else throw Error('Study settings changed on both devices. Export a backup and align the settings before syncing.');
 return repairAssignments({version:1,tasks,deleted,settings}).data;
}
export function csvRows(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell.length||quoted&&text[i+1]&&!['\r','\n',','].includes(text[i+1]))throw Error('Malformed CSV quotes.');else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw Error('Unclosed CSV quote.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;}
export function importedTask(o){const zone=o.zone||defaults.zone;let due=o.due||'';if(due&&!/(Z|[+-]\d\d:\d\d)$/.test(due))due=zonedISO(due.slice(0,16),zone);return {id:o.id||uid(),title:o.title,module:o.module||'Imported · review module',given:o.given||'',resources:o.resources||[],due,zone,type:o.type||'other',estimate:Number(o.estimate)||8,status:'not-started',priority:'auto',steps:[],logs:[],notes:o.notes||'',source:safeURL(o.source),updatedAt:new Date().toISOString(),...(o.importKey?{importKey:o.importKey}:{})};}
export function importCSV(text){const [headers,...rows]=csvRows(text.replace(/^\uFEFF/,''));if(!headers?.includes('title')||!headers.includes('module'))throw Error('CSV needs title and module headers.');return validateData({...emptyData(),tasks:rows.map(row=>importedTask(Object.fromEntries(headers.map((h,i)=>[h.trim(),row[i]||'']))))}).tasks;}
const icsUnescape=s=>s.replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1');
export function importICS(text){
 const events=text.replace(/\r?\n[ \t]/g,'').split('BEGIN:VEVENT').slice(1);const tasks=[];const warnings=[];
 for(const e of events){const lines=e.split('END:VEVENT')[0].split(/\r?\n/);const fields={};for(const line of lines){const p=line.indexOf(':');if(p>0)fields[line.slice(0,p)]=line.slice(p+1);}const get=k=>Object.entries(fields).find(([key])=>key===k||key.startsWith(k+';'));const summary=get('SUMMARY')?.[1];if(!summary)continue;
  const [dateKey,date]=(eventTitle(icsUnescape(summary))?get('DTSTART')||get('DTEND'):get('DTEND')||get('DTSTART'))||[];if(!date){warnings.push(`Skipped ${summary}: missing date.`);continue;}if(get('RRULE')){warnings.push(`Skipped recurring event ${summary}; import individual assignment deadlines instead.`);continue;}
  const zone=dateKey.match(/TZID=([^;]+)/)?.[1]?.replace(/"/g,'')||defaults.zone;let due;
  try{if(/^\d{8}$/.test(date)){const clock=eventTitle(icsUnescape(summary))?.kind==='opens'?'00:00':'23:59';warnings.push(`${summary}: all-day event imported at ${clock}; verify the actual ${clock==='00:00'?'release':'submission'} time.`);due=zonedISO(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${clock}`,zone);}else{const v=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${date.slice(9,11)}:${date.slice(11,13)}`;due=date.endsWith('Z')?v+':'+(date.slice(13,15)||'00')+'Z':new Date(Date.parse(zonedISO(v,zone))+Number(date.slice(13,15)||0)*1000).toISOString();}}
  catch{warnings.push(`Skipped ${summary}: unsupported date/time zone.`);continue;}
  const key=get('UID')?.[1];const title=icsUnescape(summary);const category=icsUnescape((get('CATEGORIES')?.[1]||'').split(/(?<!\\),/)[0]).trim();tasks.push(importedTask({title,due,zone,given:get('X-MODULE-PLANNER-GIVEN')?.[1]||'',...(category&&!/^(course|site|user)( events)?$/i.test(category)?{module:category.slice(0,120)}:{}),notes:icsUnescape(get('DESCRIPTION')?.[1]||''),source:icsUnescape(get('URL')?.[1]||''),...(key?{importKey:'ics:'+key}:{})}));
 }
 if(!tasks.length)throw Error('No usable non-recurring calendar events found.');const repaired=repairAssignments({...emptyData(),tasks});warnings.push(...repaired.warnings);if(repaired.data.tasks.some(t=>!t.given))warnings.push('Some events have no matching opens event. Add their release date from the brief to enable planning.');if(repaired.merged.length)warnings.push(repaired.merged.length+' opens/closes pair(s) combined into single assignments.');return {tasks:repaired.data.tasks,warnings};
}
function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function foldLine(line){const chunks=[];let chunk='',size=0;for(const char of line){const bytes=new TextEncoder().encode(char).length;if(size+bytes>74){chunks.push(chunk);chunk=' ';size=1;}chunk+=char;size+=bytes;}chunks.push(chunk);return chunks.join('\r\n');}
export function exportICS(tasks){const stamp=d=>new Date(d).toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Module Planner//Assignments//EN','CALSCALE:GREGORIAN'];for(const t of tasks.filter(t=>t.due&&t.status!=='completed')){lines.push('BEGIN:VEVENT',`UID:${icsEscape(t.id)}@module-planner`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(t.due)}`,`SUMMARY:${icsEscape(t.title)}`,`CATEGORIES:${icsEscape(t.module)}`,...(t.given?['X-MODULE-PLANNER-GIVEN:'+t.given]:[]),`DESCRIPTION:${icsEscape((t.given?'Given on: '+t.given+'\n':'')+t.notes+'\nEstimated total: '+t.estimate+' hours')}`,...(safeURL(t.source)?['URL:'+safeURL(t.source)]:[]),'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:Assignment due tomorrow','END:VALARM','END:VEVENT');}lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';}
export function encodeBase64(s){const bytes=new TextEncoder().encode(s);let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
export function decodeBase64(s){return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
export class GitHubStore{
 constructor({repo,path='module-planner/assignments.json',branch='main',token,fetcher=fetch}){if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw Error('Use owner/repository for the repository.');if(!path||path.startsWith('/')||path.split('/').some(p=>p==='..'||!p)||!path.endsWith('.json'))throw Error('Use a relative JSON file path without .. segments.');if(!branch.trim())throw Error('A branch is required.');Object.assign(this,{repo,path,branch,token,fetcher});this.sha=null;this.base=null;this.loaded=false;}
 async request(path,options={}){const r=await this.fetcher('https://api.github.com/repos/'+this.repo+path,{...options,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+this.token,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}});if(r.status===404)return null;if(!r.ok){if(r.status===409||r.status===422)throw Error('GitHub changed or rejected the update. Pull & merge again before retrying.');if([401,403].includes(r.status))throw Error('GitHub access denied. Check token expiry, repository access, Contents read/write permission and any rate limit.');throw Error('GitHub request failed ('+r.status+'). Your local data is unchanged.');}return r.json();}
 async inspect(){const info=await this.request('');if(!info)throw Error('Repository not found, or this token cannot access it.');return info;}
 endpoint(){return '/contents/'+this.path.split('/').map(encodeURIComponent).join('/');}
 async pull(local,persist=null){const remote=await this.request(this.endpoint()+'?ref='+encodeURIComponent(this.branch));if(remote&&(remote.encoding!=='base64'||!remote.content))throw Error('GitHub file cannot be read as JSON. Check its size and path.');const data=remote?validateData(JSON.parse(decodeBase64(remote.content))):emptyData();const merged=mergeData(local,data,this.base);if(persist)await persist(merged);this.sha=remote?.sha||null;this.base=data;this.loaded=true;return merged;}
 async push(local){if(!this.loaded)throw Error('Pull & merge before saving to GitHub.');const data=repairAssignments(local).data;const result=await this.request(this.endpoint(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Update Module Planner assignments',content:encodeBase64(JSON.stringify(data,null,2)),branch:this.branch,...(this.sha?{sha:this.sha}:{})})});if(!result?.content?.sha)throw Error('GitHub did not confirm the save. Pull again to check the remote file.');this.sha=result.content.sha;this.base=data;return result;}
}
