// Moodle emits release and deadline events separately. Keep their provenance so
// reimports and sync can recognise both events after they become one assignment.
const normal=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
export function eventTitle(title){
 const match=String(title).match(/^(.*?)\s*(?:[-–—:·]\s*|[([]\s*)?\b(opens|closes)\s*[)\]]?\s*[.!]?\s*$/i);
 if(!match)return null;const name=match[1].replace(/\s*[-–—:·([]\s*$/,'').trim();
 return name?{name,key:normal(name),kind:match[2].toLowerCase()}:null;
}
const isDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const dateOnly=(at,zone)=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
const unknown=m=>!m||normal(m).startsWith('imported · review module');
function activity(url){try{const u=new URL(url);return /\/mod\/[^/]+\/view\.php$/.test(u.pathname)&&u.searchParams.has('id')?u.origin+u.pathname+'?id='+u.searchParams.get('id'):'';}catch{return '';}}
function compatible(a,b){if(!unknown(a.module)&&!unknown(b.module)&&normal(a.module)!==normal(b.module))return false;const x=activity(a.source),y=activity(b.source);return !x||!y||x===y;}
export const eventKeys=t=>[...new Set([t.importKey,...(t.importKeys||[]),...(t.pairedEvents||[]).map(e=>e.importKey)].filter(Boolean))];
export const taskIds=t=>[t.id,...(t.mergedIds||[]),...(t.pairedEvents||[]).map(e=>e.id)].filter(Boolean);
function combineEvents(...groups){const map=new Map();for(const e of groups.flat()){const key=e.importKey||e.id||e.kind+'|'+e.at;map.set(key,e);}return [...map.values()];}
const joinNotes=(a,b)=>!b||a===b||a?.includes(b)?a||'':!a||b.includes(a)?b:a+'\n\n'+b;
function combineLinks(a=[],b=[]){return [...new Map([...a,...b].map(l=>[l.url,l])).values()];}
export function combineWork(primary,secondary){
 const out=structuredClone(primary);out.notes=joinNotes(primary.notes,secondary.notes);out.resources=combineLinks(primary.resources,secondary.resources);
 if(!out.source)out.source=secondary.source;if(unknown(out.module)&&!unknown(secondary.module))out.module=secondary.module;
 if(out.type==='other'&&secondary.type!=='other')out.type=secondary.type;
 // Release and closing entries describe the same work: do not add estimates.
 out.estimate=Math.max(primary.estimate,secondary.estimate);
 out.words=Math.max(primary.words||0,secondary.words||0);if(out.weight===''&&secondary.weight!=='')out.weight=secondary.weight;
 const steps=new Map();for(const s of [...(primary.steps||[]),...(secondary.steps||[])]){const key=normal(s.text),old=steps.get(key);steps.set(key,old?{...s,...old,done:old.done||s.done,detail:old.detail||s.detail,links:combineLinks(old.links,s.links)}:s);}out.steps=[...steps.values()];
 out.logs=[...new Map([...(primary.logs||[]),...(secondary.logs||[])].map(l=>[l.id,l])).values()];
 if(out.status!=='completed'&&(out.logs.length||out.steps.some(s=>s.done)||secondary.status==='in-progress'))out.status='in-progress';
 out.importKeys=[...new Set([...eventKeys(primary),...eventKeys(secondary)])].sort();
 out.mergedIds=[...new Set([...taskIds(primary),...taskIds(secondary)])].filter(id=>id!==out.id).sort();
 out.pairedEvents=combineEvents(primary.pairedEvents||[],secondary.pairedEvents||[]);
 out.updatedAt=[primary.updatedAt,secondary.updatedAt].filter(isDate).sort().at(-1)||new Date(0).toISOString();
 return out;
}
function annotated(task){
 const role=eventTitle(task.title);if(!role)return {task,role:null};const copy=structuredClone(task);
 let event=(copy.pairedEvents||[]).find(e=>e.kind===role.kind&&(e.importKey===copy.importKey||e.id===copy.id));
 const at=role.kind==='opens'?(copy.due||event?.at):copy.due||event?.at;
 if(at)event={id:copy.id,kind:role.kind,at,title:copy.title,source:copy.source||'',...(copy.importKey?{importKey:copy.importKey}:{})};
 if(event)copy.pairedEvents=combineEvents(copy.pairedEvents||[],[event]);
 if(role.kind==='opens'&&event){copy.given=dateOnly(event.at,copy.zone);copy.due='';}
 return {task:copy,role,event};
}
export function pairAssignmentEvents(input){
 const data=structuredClone(input),warnings=[],merged=[];const entries=data.tasks.map(annotated);const buckets=new Map();
 for(const entry of entries){if(!entry.role)continue;const group=buckets.get(entry.role.key)||[];group.push(entry);buckets.set(entry.role.key,group);}
 const consumed=new Set(),replacements=new Map();
 for(const group of buckets.values()){
  const opens=group.filter(e=>e.role.kind==='opens'),closes=group.filter(e=>e.role.kind==='closes');
  for(const open of opens){
   const matches=closes.filter(close=>compatible(open.task,close.task));
   if(matches.length!==1||opens.filter(e=>compatible(e.task,matches[0]?.task||{})).length!==1){if(matches.length)warnings.push(`Multiple possible opens/closes matches for “${open.role.name}”. These events were kept separate for review.`);continue;}
   const close=matches[0];if(!open.event?.at||!close.event?.at){warnings.push(`“${open.role.name}” is missing an event date. Its events were kept separate.`);continue;}
   if(Date.parse(open.event.at)>=Date.parse(close.event.at)){warnings.push(`“${open.role.name}” opens at or after it closes. Check the two event dates.`);continue;}
   const combined=combineWork(close.task,open.task);combined.title=close.role.name;combined.zone=close.task.zone;combined.given=dateOnly(open.event.at,combined.zone);combined.due=close.event.at;
   // Finishing the release reminder must not mark the assessed work submitted.
   combined.status=close.task.status==='completed'?'completed':combined.logs.length||combined.steps.some(s=>s.done)||close.task.status==='in-progress'||open.task.status==='in-progress'?'in-progress':'not-started';
   consumed.add(open.task.id);replacements.set(close.task.id,combined);data.deleted[open.task.id]=combined.updatedAt;merged.push({title:combined.title,openId:open.task.id,closeId:close.task.id});
  }
 }
 data.tasks=entries.filter(e=>!consumed.has(e.task.id)).map(e=>replacements.get(e.task.id)||e.task);
 for(const e of entries){if(!e.role||consumed.has(e.task.id)||replacements.has(e.task.id))continue;warnings.push(`“${e.task.title}” has no unambiguous matching ${e.role.kind==='opens'?'closes':'opens'} event. ${e.role.kind==='opens'?'Its date is saved as the release date, not a deadline.':'Its deadline is kept; add the release date if necessary.'}`);}
 return {data,warnings:[...new Set(warnings)],merged};
}
export function importAssignments(existing,incoming){
 let data=structuredClone(existing);let count=0;
 for(const item of incoming){
  const keys=eventKeys(item),ids=taskIds(item);const matches=data.tasks.filter(t=>taskIds(t).some(id=>ids.includes(id))||eventKeys(t).some(k=>keys.includes(k)));
  if(!matches.length){if(ids.some(id=>data.deleted[id]))continue;data.tasks.push(structuredClone(item));count++;continue;}
  // Prefer the existing closing record, which owns submission status and ID.
  const closeKey=item.pairedEvents?.find(e=>e.kind==='closes')?.importKey;
  const primary=matches.find(t=>closeKey&&eventKeys(t).includes(closeKey))||matches.find(t=>eventTitle(t.title)?.kind!=='opens')||matches[0];
  let combined=structuredClone(primary);for(const extra of matches.filter(t=>t!==primary))combined=combineWork(combined,extra);
  const priorEstimate=combined.estimate;combined=combineWork(combined,item);combined.estimate=priorEstimate;
  const role=eventTitle(item.title);const events=combineEvents(combined.pairedEvents||[],item.pairedEvents||[]);combined.pairedEvents=events;
  if(role?.kind==='opens'){const event=events.find(e=>e.kind==='opens'&&(e.importKey===item.importKey||e.id===item.id));if(event)combined.given=dateOnly(event.at,combined.zone);else if(item.due)combined.given=dateOnly(item.due,combined.zone);}
  else {if(item.due)combined.due=item.due;if(item.given)combined.given=item.given;}
  if(item.pairedEvents?.some(e=>e.kind==='opens')&&item.pairedEvents.some(e=>e.kind==='closes'))combined.title=item.title;
  combined.updatedAt=[combined.updatedAt,item.updatedAt].filter(isDate).sort().at(-1);
  if(item.status==='completed'&&role?.kind!=='opens')combined.status='completed';
  data.tasks=data.tasks.filter(t=>!matches.includes(t));data.tasks.push(combined);
  for(const t of matches)if(t.id!==combined.id)data.deleted[t.id]=combined.updatedAt;
  count++;
 }
 const repaired=pairAssignmentEvents(data);return {...repaired,count};
}
