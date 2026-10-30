import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,importedTask,validateData,repairAssignments,applyImports,planStudy,remaining,releaseTimestamp,importICS,exportICS,mergeData,GitHubStore,encodeBase64,decodeBase64} from '../dist/core.mjs';
import {eventTitle} from '../dist/pairing.mjs';
const task=(kind,extra={})=>importedTask({id:kind,title:'Research essay ('+kind+')',module:'HIST1001',due:kind==='opens'?'2026-10-28T15:30:00Z':'2026-11-06T12:00:00Z',estimate:12,importKey:'ics:'+kind,...extra});
const pair=()=>({...emptyData(),tasks:[task('opens'),task('closes')]});
test('only terminal opens/closes markers are recognised, including wrappers and punctuation',()=>{
 for(const name of ['Research essay opens','Research essay (opens)','Research essay — OPENS','Research essay [opens].'])assert.equal(eventTitle(name)?.name,'Research essay');
 assert.equal(eventTitle('How trade opens markets'),null);assert.equal(eventTitle('Opens'),null);
});
test('matching events become one deadline record with the actual release date and time',()=>{
 const r=repairAssignments(pair());assert.equal(r.data.tasks.length,1);assert.equal(r.merged.length,1);const t=r.data.tasks[0];assert.equal(t.id,'closes');assert.equal(t.title,'Research essay');assert.equal(t.given,'2026-10-28');assert.equal(t.due,'2026-11-06T12:00:00.000Z');assert.equal(releaseTimestamp(t),'2026-10-28T15:30:00.000Z');assert.equal(t.pairedEvents.length,2);assert.deepEqual(t.importKeys,['ics:closes','ics:opens']);assert(r.data.deleted.opens);assert.deepEqual(repairAssignments(r.data).data,r.data);
 const p=planStudy(r.data,new Date('2026-10-28T08:00:00Z'));assert(p.days.flatMap(d=>d.blocks).every(b=>Date.parse(b.start)>=Date.parse('2026-10-28T15:30:00Z')&&Date.parse(b.end)<=Date.parse(t.due)));
});
test('merging retains progress, unique logs, links and notes without doubling effort or treating release completion as submission',()=>{
 const d=pair(),[open,close]=d.tasks;open.status='completed';open.notes='Opening notes';close.notes='Closing notes';open.resources=[{label:'Library',url:'https://example.com/library'}];close.resources=[{label:'Brief',url:'https://example.com/brief'}];open.steps=[{id:'one',text:'Read brief',done:true}];close.steps=[{id:'two',text:'Read brief',done:false},{id:'three',text:'Submit',done:false}];const shared={id:'log',hours:2,at:'2026-10-29T12:00:00Z'};open.logs=[shared];close.logs=[shared,{id:'another',hours:1,at:'2026-10-29T13:00:00Z'}];
 const t=repairAssignments(d).data.tasks[0];assert.equal(t.status,'in-progress');assert.equal(t.steps.length,2);assert.equal(t.steps[0].done,true);assert.equal(t.logs.length,2);assert.equal(remaining(t),9);assert.equal(t.resources.length,2);assert.match(t.notes,/Opening notes/);assert.match(t.notes,/Closing notes/);
 close.status='completed';assert.equal(repairAssignments(d).data.tasks[0].status,'completed');
});
test('unmatched opens dates never become deadlines and remain matchable after a later import',()=>{
 const single=repairAssignments({...emptyData(),tasks:[task('opens')]});assert.equal(single.data.tasks[0].given,'2026-10-28');assert.equal(single.data.tasks[0].due,'');assert.match(single.warnings.join(' '),/no unambiguous/);
 const next=applyImports(single.data,[task('closes')]);assert.equal(next.data.tasks.length,1);assert.equal(next.data.tasks[0].given,'2026-10-28');assert.equal(next.data.tasks[0].due,'2026-11-06T12:00:00.000Z');
 const reverse=applyImports({...emptyData(),tasks:[task('closes')]},[task('opens')]);assert.equal(reverse.data.tasks.length,1);
});
test('pairs do not cross modules or different Moodle activities and ambiguity does not guess',()=>{
 const different=pair();different.tasks[1].module='HIST2002';assert.equal(repairAssignments(different).data.tasks.length,2);
 const activities=pair();activities.tasks[0].source='https://moodle.nottingham.ac.uk/mod/assign/view.php?id=1';activities.tasks[1].source='https://moodle.nottingham.ac.uk/mod/assign/view.php?id=2';assert.equal(repairAssignments(activities).data.tasks.length,2);
 const ambiguous=pair();ambiguous.tasks.push({...task('opens'),id:'second',importKey:'ics:other'});const result=repairAssignments(ambiguous);assert.equal(result.data.tasks.length,3);assert.match(result.warnings.join(' '),/Multiple possible/);
});
test('reversed event dates remain separate and flag the inconsistency',()=>{const d=pair();d.tasks[0].due='2026-12-01T10:00:00Z';const r=repairAssignments(d);assert.equal(r.data.tasks.length,2);assert.match(r.warnings.join(' '),/at or after/);});
test('same names in distinct modules produce two correct pairs',()=>{const d=pair();d.tasks.push(task('opens',{id:'b-open',module:'HIST2002',importKey:'ics:bo'}),task('closes',{id:'b-close',module:'HIST2002',importKey:'ics:bc'}));assert.equal(repairAssignments(d).data.tasks.length,2);});
test('reimporting a full pair or either event updates dates without losing custom work or adding duplicates',()=>{
 let d=repairAssignments(pair()).data;const t=d.tasks[0];t.estimate=20;t.steps=[{id:'custom',text:'Read feedback',done:true}];t.logs=[{id:'work',hours:3,at:'2026-10-29T13:00:00Z'}];t.notes='My notes';
 const incoming=repairAssignments({...emptyData(),tasks:[task('opens',{id:'new-open'}),task('closes',{id:'new-close',due:'2026-11-07T12:00:00Z'})]}).data.tasks;
 d=applyImports(d,incoming).data;assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].id,'closes');assert.equal(d.tasks[0].estimate,20);assert.equal(d.tasks[0].steps[0].done,true);assert.equal(d.tasks[0].logs.length,1);assert.equal(d.tasks[0].due,'2026-11-07T12:00:00.000Z');
 d=applyImports(d,repairAssignments({...emptyData(),tasks:[task('opens',{id:'third-open',due:'2026-10-29T16:00:00Z'})]}).data.tasks).data;assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].given,'2026-10-29');assert.equal(d.tasks[0].due,'2026-11-07T12:00:00.000Z');
 d=applyImports(d,[task('closes',{id:'third-close',due:'2026-11-08T12:00:00Z'})]).data;assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].given,'2026-10-29');assert.equal(d.tasks[0].due,'2026-11-08T12:00:00.000Z');
});
test('importing one merged item joins two existing records by either calendar UID',()=>{const incoming=repairAssignments({...emptyData(),tasks:[task('opens',{id:'new-open'}),task('closes',{id:'new-close'})]}).data.tasks;const result=applyImports(pair(),incoming);assert.equal(result.data.tasks.length,1);assert.equal(result.data.tasks[0].id,'closes');assert.equal(result.data.tasks[0].title,'Research essay');});
test('calendar starts are used for opens/closes, even when their event ends differ',()=>{
 const ics='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:open\r\nSUMMARY:Essay (opens)\r\nCATEGORIES:HIST1001\r\nDTSTART:20261028T153045Z\r\nDTEND:20261029T160000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:close\r\nSUMMARY:Essay (closes)\r\nCATEGORIES:HIST1001\r\nDTSTART:20261106T120030Z\r\nDTEND:20261106T130000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';const r=importICS(ics);assert.equal(r.tasks.length,1);assert.equal(r.tasks[0].given,'2026-10-28');assert.equal(r.tasks[0].due,'2026-11-06T12:00:30.000Z');assert.equal(r.tasks[0].module,'HIST1001');assert.match(r.warnings.join(' '),/combined/);
});
test('normalisation on both sides of GitHub merge does not resurrect release records',async()=>{
 const raw=validateData(pair()),local=repairAssignments(raw).data;assert.deepEqual(mergeData(local,raw,raw),local);
 const fetched=[];const store=new GitHubStore({repo:'owner/repo',token:'test',fetcher:async(url,options)=>{if(options.method==='PUT'){fetched.push(JSON.parse(decodeBase64(JSON.parse(options.body).content)));return {ok:true,json:async()=>({content:{sha:'new'}})};}return {ok:true,json:async()=>({encoding:'base64',content:encodeBase64(JSON.stringify(raw)),sha:'old'})};}});
 const next=await store.pull(local);assert.equal(next.tasks.length,1);next.tasks[0].notes='Edited after pull';await store.push(next);assert.equal(fetched[0].tasks.length,1);assert.equal(fetched[0].tasks[0].notes,'Edited after pull');
});
test('a failed local save during pull leaves the prior GitHub baseline intact',async()=>{
 const raw=pair(),store=new GitHubStore({repo:'owner/repo',token:'test',fetcher:async()=>({ok:true,json:async()=>({encoding:'base64',content:encodeBase64(JSON.stringify(raw)),sha:'remote-head'})})});
 await assert.rejects(()=>store.pull(emptyData(),()=>{throw Error('Device storage is full');}),/storage is full/);assert.equal(store.base,null);assert.equal(store.sha,null);assert.equal(store.loaded,false);
 const saved=[];const merged=await store.pull(emptyData(),value=>saved.push(value));assert.equal(merged.tasks.length,1);assert.equal(saved[0].tasks.length,1);assert.equal(store.sha,'remote-head');
});
test('deadline edits before the known opening time are rejected without changing source data',()=>{
 const d=repairAssignments(pair()).data,original=structuredClone(d);assert.throws(()=>applyImports(d,[task('closes',{due:'2026-10-28T14:00:00Z'})]),/deadline must be after/i);assert.deepEqual(d,original);
});
test('the merged release date and module survive deadline calendar export and reimport',()=>{
 const t=repairAssignments(pair()).data.tasks[0],out=exportICS([t]),back=importICS(out).tasks;assert.equal(back.length,1);assert.equal(back[0].title,t.title);assert.equal(back[0].module,t.module);assert.equal(back[0].given,t.given);assert.equal(back[0].due,t.due);
});

test('all-day opens start at midnight while all-day closes retain the end of the day',()=>{const file='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Essay (opens)\r\nDTSTART;VALUE=DATE:20261101\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Essay (closes)\r\nDTSTART;VALUE=DATE:20261106\r\nEND:VEVENT\r\nEND:VCALENDAR';const r=importICS(file);assert.equal(r.tasks.length,1);assert.equal(releaseTimestamp(r.tasks[0]),'2026-11-01T00:00:00.000Z');assert.equal(r.tasks[0].due,'2026-11-06T23:59:00.000Z');});
