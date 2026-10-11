import {selectDailySet, selectMore, scheduleReview, aggregateProgress, localDateKey} from './core.js';

const STORAGE_KEY = 'werkwort.state.v1';
const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let catalog = [];
let byId = new Map();
let revealed = false;
let answerLock = false;
let sessionStartedAt = Date.now();

const defaultState = () => ({
  schemaVersion:1,
  settings:{dailyTarget:10,speechRate:0.9,listenFirst:false,levels:['B2','C1'],domains:[]},
  cards:{}, dailySets:{}, activity:{}, currentSession:null, practiceCounter:0
});

function loadState(){
  try {
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(!parsed || parsed.schemaVersion!==1) return defaultState();
    return {...defaultState(),...parsed,settings:{...defaultState().settings,...parsed.settings}};
  } catch { showToast('Saved progress was unreadable. A fresh local profile was opened.'); return defaultState(); }
}
let state=loadState();
function saveState(){ try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{showToast('Progress could not be saved in this browser.');} updateStreak(); }
function esc(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),3200);}
function today(){return localDateKey(new Date(),timeZone);}
function currentRoute(){const route=location.hash.replace('#/','').split('?')[0];return ['learn','practice','progress','library'].includes(route)?route:'learn';}
function setActiveNav(){document.querySelectorAll('[data-route]').forEach(link=>link.classList.toggle('active',link.dataset.route===currentRoute()));}

function eligibleCatalog(filters=state.settings){
  return catalog.filter(word=>word.status==='active'&&(!filters.levels?.length||filters.levels.includes(word.level))&&(!filters.domains?.length||filters.domains.includes(word.domain)));
}
function ensureDaily(){
  const key=today();
  if(!state.dailySets[key]){
    const ids=selectDailySet(catalog,state.cards,key,state.settings.dailyTarget,state.settings);
    state.dailySets[key]={ids,completedIds:[],createdAt:new Date().toISOString(),completedAt:null};saveState();
  }
  return state.dailySets[key];
}
function cardStatus(id){
  const card=state.cards[id];
  if(!card)return 'New';
  if(card.lapses>=2&&card.incorrect>card.correct/2)return 'Weak';
  if(card.repetitions>=4&&card.intervalDays>=14)return 'Mastered';
  return card.status==='relearning'?'Relearning':'Learning';
}
function updateStreak(){
  const active=new Set(Object.entries(state.activity).filter(([,v])=>(v.studied||0)>0).map(([k])=>k));
  let count=0,date=new Date();
  if(!active.has(localDateKey(date,timeZone))){date.setDate(date.getDate()-1);}
  while(active.has(localDateKey(date,timeZone))){count++;date.setDate(date.getDate()-1);}
  document.querySelector('#streakLabel').textContent=`${count} day${count===1?'':'s'} streak`;
}

function pageHeader(eyebrow,title,copy){return `<header class="page-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(copy)}</p></div></header>`;}
function alignmentNotice(){return `<div class="notice">Vocabulary is aligned with CEFR B2–C1 and Goethe-Zertifikat practice skills. It is original editorial content, not an official Goethe-Institut word list.</div>`;}
function todayStats(){return state.activity[today()]||{studied:0,correct:0,seconds:0};}

function renderLearn(){
  if(state.currentSession?.type==='daily')return renderSession();
  const set=ensureDaily(),done=set.completedIds.length,total=set.ids.length,stats=todayStats();
  const complete=Boolean(set.completedAt);
  app.innerHTML=pageHeader('Daily learning','Today’s technical German','Read, listen, recall, and space your reviews. Your set stays stable all day.')+alignmentNotice()+`
  <div class="today-grid">
    <section class="card today-card">
      <div class="today-top"><span class="badge">${complete?'Daily set complete':'Daily set'}</span><span class="counter">${done} / ${total}</span></div>
      <div class="today-main"><div class="big-progress"><b>${Math.max(total-done,0)}</b><span>${complete?'completed':'cards remaining'}</span></div><h2>${complete?'Gut gemacht.':'Bereit?'}</h2><p>${complete?'Your scheduled work is complete. Continue with optional practice whenever you want.':`${total-done} B2–C1 technical terms with German example sentences and pronunciation.`}</p></div>
      <div class="actions"><button class="button primary" data-action="start-daily">${done?'Resume daily set':'Start daily set'}</button><button class="button secondary" data-action="practice-more">Extra practice</button></div>
    </section>
    <div class="side-stack">
      <section class="card metric-card"><h3>Today</h3><div class="metric-row"><span>Studied</span><b>${stats.studied||0}</b></div><div class="metric-row"><span>Remembered</span><b>${stats.studied?Math.round((stats.correct||0)/stats.studied*100):0}%</b></div><div class="metric-row"><span>Due now</span><b>${dueIds().length}</b></div></section>
      <section class="card metric-card"><h3>How it works</h3><div class="metric-row"><span>Reading</span><b>German + English</b></div><div class="metric-row"><span>Listening</span><b>Word + sentence</b></div><p class="muted">Use Again, Hard, Good, or Easy. WerkWort schedules the next review automatically.</p></section>
    </div>
  </div>`;
}
function dueIds(){const now=Date.now();return catalog.filter(word=>state.cards[word.id]&&Date.parse(state.cards[word.id].dueAt)<=now).map(word=>word.id);}
function startDaily(){
  const set=ensureDaily();const remaining=set.ids.filter(id=>!set.completedIds.includes(id));
  if(!remaining.length){showToast('Today’s set is complete. Starting extra practice instead.');return startExtraPractice();}
  state.currentSession={type:'daily',ids:remaining,index:0,startedAt:new Date().toISOString()};revealed=false;sessionStartedAt=Date.now();saveState();render();
}
function startExtraPractice(){
  const shown=ensureDaily().ids;
  let ids=selectMore(catalog,shown,10,`extra-${today()}-${state.practiceCounter}`,state.settings);
  if(!ids.length)ids=selectMore(catalog,[],10,`review-${today()}-${state.practiceCounter}`,state.settings);
  state.practiceCounter++;state.currentSession={type:'practice',ids,index:0,startedAt:new Date().toISOString()};revealed=false;sessionStartedAt=Date.now();saveState();location.hash='#/learn';render();
}

function renderSession(){
  const session=state.currentSession;if(!session)return renderLearn();
  if(session.index>=session.ids.length)return renderCompletion(session.type);
  const word=byId.get(session.ids[session.index]);
  if(!word){session.index++;saveState();return renderSession();}
  const pct=Math.round(session.index/session.ids.length*100);
  const hideTerm=state.settings.listenFirst&&!revealed;
  app.innerHTML=`<section class="card session-card">
    <div class="session-top"><div><span class="badge">${esc(word.domain)}</span> <span class="badge level">${esc(word.level)}</span></div><span class="counter">${session.index+1} / ${session.ids.length}</span></div>
    <div class="progress-line" aria-label="Session progress ${pct}%"><i style="width:${pct}%"></i></div>
    <div class="word-area ${hideTerm?'listen-first':''}"><p class="eyebrow">${hideTerm?'Listen first':'German term'}</p><h2 id="cardHeading" tabindex="-1" lang="de">${hideTerm?'Listen to reveal':esc(word.term)}</h2><div class="grammar">Noun · plural: <span lang="de">${esc(word.plural)}</span></div>
      <div class="audio-row"><button class="audio-button" data-speak="word" aria-label="Play German pronunciation for ${esc(word.term)}">Play word</button>${revealed?`<button class="audio-button" data-speak="sentence" aria-label="Play German example sentence">Play sentence</button>`:''}<button class="audio-button" data-action="stop-audio">Stop audio</button></div>
    </div>
    ${revealed?`<div class="reveal-panel"><div class="translation">${esc(word.translation)}</div><p class="example-de" lang="de">${esc(word.exampleDe)}</p><p class="example-en">${esc(word.exampleEn)}</p><div class="rating-grid" aria-label="How well did you remember?"><button class="rating" data-rating="again">Again<small>10 min</small></button><button class="rating" data-rating="hard">Hard<small>shorter</small></button><button class="rating" data-rating="good">Good<small>normal</small></button><button class="rating" data-rating="easy">Easy<small>longer</small></button></div></div>`:`<div class="actions"><button class="button primary" data-action="reveal">Reveal meaning</button><button class="button" data-action="pause">Pause session</button></div>`}
  </section>`;
  requestAnimationFrame(()=>document.querySelector('#cardHeading')?.focus({preventScroll:true}));
}
function answer(rating){
  if(answerLock)return;answerLock=true;
  const session=state.currentSession, id=session.ids[session.index], now=new Date().toISOString();
  state.cards[id]=scheduleReview(state.cards[id]||{},rating,now);
  const day=state.activity[today()]||{studied:0,correct:0,seconds:0};
  day.studied++;if(rating!=='again')day.correct++;day.seconds+=Math.max(1,Math.round((Date.now()-sessionStartedAt)/1000));state.activity[today()]=day;
  if(session.type==='daily'){
    const set=ensureDaily();if(!set.completedIds.includes(id))set.completedIds.push(id);
    if(set.completedIds.length>=set.ids.length)set.completedAt=now;
  }
  session.index++;revealed=false;sessionStartedAt=Date.now();saveState();
  const due=state.cards[id].dueAt;showToast(`${rating[0].toUpperCase()+rating.slice(1)} · next review ${formatDue(due)}`);
  setTimeout(()=>{answerLock=false;render();},120);
}
function formatDue(iso){const diff=Date.parse(iso)-Date.now();if(diff<3_600_000)return 'in 10 minutes';const days=Math.max(1,Math.round(diff/86_400_000));return `in ${days} day${days===1?'':'s'}`;}
function renderCompletion(type){
  const count=state.currentSession?.ids.length||0;state.currentSession=null;saveState();
  app.innerHTML=`<section class="card complete"><span class="badge">${type==='daily'?'Daily set complete':'Practice complete'}</span><h2>Gut gemacht.</h2><p>You reviewed ${count} technical German term${count===1?'':'s'}. The spaced-repetition queue has been updated.</p><div class="actions"><button class="button primary" data-action="practice-more">Practice 10 more</button><a class="button" href="#/progress">View progress</a></div></section>`;
}

function renderPractice(){
  if(state.currentSession?.type==='practice')return renderSession();
  const domains=[...new Set(catalog.map(x=>x.domain))].sort();
  app.innerHTML=pageHeader('Optional practice','Choose your session','Train weak words, due reviews, listening, or a technical field without changing the identity of today’s set.')+`
  <div class="config-grid">
    <section class="card config-card"><h2>Build a session</h2><form id="practiceForm" class="form-grid">
      <label>Mode<select name="mode"><option value="mixed">Mixed</option><option value="due">Due reviews</option><option value="weak">Weak words</option><option value="new">New words</option><option value="listening">Listening first</option></select></label>
      <label>Technical field<select name="domain"><option value="">All fields</option>${domains.map(d=>`<option>${esc(d)}</option>`).join('')}</select></label>
      <div><label>Level</label><div class="filter-chips"><label><input type="checkbox" name="level" value="B2" checked><span>B2</span></label><label><input type="checkbox" name="level" value="C1" checked><span>C1</span></label></div></div>
      <label>Session length<select name="count"><option>5</option><option selected>10</option><option>20</option></select></label>
      <button class="button primary" type="submit">Start practice</button>
    </form></section>
    <section class="card config-card"><h2>Review queue</h2><div class="metric-row"><span>Due now</span><b>${dueIds().length}</b></div><div class="metric-row"><span>Weak words</span><b>${Object.keys(state.cards).filter(id=>cardStatus(id)==='Weak').length}</b></div><div class="metric-row"><span>Unseen words</span><b>${catalog.filter(x=>!state.cards[x.id]).length}</b></div><p class="muted">Listening mode starts each card with the written German hidden. You can replay both the word and its sentence.</p></section>
  </div>`;
}
function submitPractice(form){
  const data=new FormData(form),mode=data.get('mode'),count=Number(data.get('count')),domain=data.get('domain'),levels=data.getAll('level');
  const filters={levels,domains:domain?[domain]:[]};let pool=eligibleCatalog(filters);
  if(mode==='due')pool=pool.filter(x=>dueIds().includes(x.id));
  if(mode==='weak')pool=pool.filter(x=>cardStatus(x.id)==='Weak');
  if(mode==='new')pool=pool.filter(x=>!state.cards[x.id]);
  let ids=selectMore(pool,[],count,`practice-${today()}-${state.practiceCounter++}`,filters);
  if(!ids.length){showToast('No words match those filters. Try Mixed or another field.');return;}
  state.settings.listenFirst=mode==='listening';state.currentSession={type:'practice',ids,index:0,startedAt:new Date().toISOString()};revealed=false;saveState();render();
}

function renderProgress(){
  const progress=aggregateProgress(state.activity,new Date());
  const entries=Object.values(state.cards),mastered=entries.filter(c=>c.repetitions>=4&&c.intervalDays>=14).length,weak=Object.keys(state.cards).filter(id=>cardStatus(id)==='Weak').length;
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=localDateKey(d,timeZone);days.push({key,label:new Intl.DateTimeFormat('en',{weekday:'short'}).format(d),value:state.activity[key]?.studied||0});}
  const max=Math.max(1,...days.map(d=>d.value));
  app.innerHTML=pageHeader('Your record','Progress','Weekly and monthly totals are calculated from completed reviews in this browser.')+`
  <div class="progress-grid"><div class="card stat"><b>${progress.week.studied}</b><span>words this week</span></div><div class="card stat"><b>${progress.week.accuracy}%</b><span>weekly recall</span></div><div class="card stat"><b>${progress.month.activeDays}</b><span>active days this month</span></div><div class="card stat"><b>${progress.month.studied}</b><span>words this month</span></div></div>
  <section class="card chart-card"><h2>Last seven days</h2><div class="bars">${days.map(d=>`<div class="bar-wrap" aria-label="${d.label}: ${d.value} words"><span class="bar-value">${d.value}</span><i class="bar" style="height:${Math.max(2,d.value/max*125)}px"></i><span class="bar-label">${d.label}</span></div>`).join('')}</div></section>
  <section class="card chart-card"><h2>Vocabulary state</h2><div class="mastery"><div><b>${catalog.length-entries.length}</b><span>New</span></div><div><b>${entries.length-mastered-weak}</b><span>Learning</span></div><div><b>${mastered}</b><span>Mastered</span></div><div><b>${weak}</b><span>Weak</span></div></div><p class="muted">“Mastered” means several successful recalls over spaced days. This is vocabulary practice data, not a formal CEFR proficiency assessment.</p></section>`;
}

function renderLibrary(){
  const params=new URLSearchParams(location.hash.split('?')[1]||''),q=params.get('q')||'',level=params.get('level')||'',domain=params.get('domain')||'';
  const domains=[...new Set(catalog.map(x=>x.domain))].sort();
  const visible=catalog.filter(word=>(!q||`${word.term} ${word.translation} ${word.exampleDe}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()))&&(!level||word.level===level)&&(!domain||word.domain===domain));
  app.innerHTML=pageHeader('Reference','Vocabulary library',`${visible.length} of ${catalog.length} technical terms. Search German, English, or example sentences.`)+`
  <div class="library-tools"><input id="librarySearch" type="search" value="${esc(q)}" placeholder="Search vocabulary…" aria-label="Search vocabulary"><select id="libraryLevel" aria-label="Filter by level"><option value="">All levels</option><option ${level==='B2'?'selected':''}>B2</option><option ${level==='C1'?'selected':''}>C1</option></select><select id="libraryDomain" aria-label="Filter by field"><option value="">All fields</option>${domains.map(d=>`<option ${domain===d?'selected':''}>${esc(d)}</option>`).join('')}</select></div>
  <div class="library-list">${visible.length?visible.map(word=>`<article class="word-row"><div><strong lang="de">${esc(word.term)}</strong><small>Plural: <span lang="de">${esc(word.plural)}</span></small></div><div class="meaning">${esc(word.translation)}</div><div class="domain">${esc(word.domain)}</div><div class="status-pill">${word.level} · ${cardStatus(word.id)}</div><button class="audio-button" data-library-speak="${esc(word.id)}" aria-label="Play pronunciation for ${esc(word.term)}">Play</button></article>`).join(''):`<div class="empty">No vocabulary matches these filters.</div>`}</div>`;
}
function updateLibraryHash(){const q=document.querySelector('#librarySearch')?.value||'',level=document.querySelector('#libraryLevel')?.value||'',domain=document.querySelector('#libraryDomain')?.value||'';location.hash=`#/library?${new URLSearchParams({q,level,domain})}`;}

function speak(text){
  if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){showToast('Speech is not available in this browser.');return;}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='de-DE';utterance.rate=Number(state.settings.speechRate)||.9;
  const voices=speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('de')).sort((a,b)=>a.voiceURI.localeCompare(b.voiceURI));if(voices[0])utterance.voice=voices[0];utterance.onerror=()=>showToast('The German voice could not be played.');speechSynthesis.speak(utterance);
}
function stopAudio(){if('speechSynthesis'in window)speechSynthesis.cancel();}

function openSettings(){
  document.querySelector('#dailyTarget').value=state.settings.dailyTarget;document.querySelector('#speechRate').value=state.settings.speechRate;document.querySelector('#speechRateOutput').textContent=`${Number(state.settings.speechRate).toFixed(2)}×`;document.querySelector('#listenFirst').checked=state.settings.listenFirst;document.querySelector('#settingsDialog').showModal();
}
function exportProgress(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`werkwort-progress-${today()}.json`;a.click();URL.revokeObjectURL(url);}
async function importProgress(file){try{const parsed=JSON.parse(await file.text());if(parsed.schemaVersion!==1||typeof parsed.cards!=='object'||typeof parsed.activity!=='object')throw new Error();state={...defaultState(),...parsed,settings:{...defaultState().settings,...parsed.settings}};saveState();document.querySelector('#settingsDialog').close();showToast('Progress imported.');render();}catch{showToast('That file is not a valid WerkWort export.');}}
function resetProgress(){if(!confirm('Delete all WerkWort progress and settings from this browser?'))return;localStorage.removeItem(STORAGE_KEY);state=defaultState();document.querySelector('#settingsDialog').close();saveState();showToast('Local progress reset.');render();}

function render(){setActiveNav();stopAudio();const route=currentRoute();if(route==='learn')renderLearn();if(route==='practice')renderPractice();if(route==='progress')renderProgress();if(route==='library')renderLibrary();updateStreak();}

app.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='start-daily')startDaily();
  if(action==='practice-more')startExtraPractice();
  if(action==='reveal'){revealed=true;renderSession();}
  if(action==='pause'){state.currentSession=null;saveState();render();}
  if(action==='stop-audio')stopAudio();
  const rating=event.target.closest('[data-rating]')?.dataset.rating;if(rating)answer(rating);
  const speakKind=event.target.closest('[data-speak]')?.dataset.speak;if(speakKind){const session=state.currentSession,word=byId.get(session.ids[session.index]);speak(speakKind==='word'?word.speechText:word.exampleDe);}
  const libraryId=event.target.closest('[data-library-speak]')?.dataset.librarySpeak;if(libraryId)speak(byId.get(libraryId)?.speechText||'');
});
app.addEventListener('submit',event=>{if(event.target.id==='practiceForm'){event.preventDefault();submitPractice(event.target);}});
app.addEventListener('input',event=>{if(event.target.id==='librarySearch'){clearTimeout(updateLibraryHash.timer);updateLibraryHash.timer=setTimeout(updateLibraryHash,220);}});
app.addEventListener('change',event=>{if(['libraryLevel','libraryDomain'].includes(event.target.id))updateLibraryHash();});
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.code==='Space'&&!revealed&&state.currentSession){event.preventDefault();revealed=true;renderSession();}
  if(revealed&&['1','2','3','4'].includes(event.key))answer(['again','hard','good','easy'][Number(event.key)-1]);
  if(event.key.toLowerCase()==='p'&&state.currentSession){const w=byId.get(state.currentSession.ids[state.currentSession.index]);if(w)speak(w.speechText);}
  if(event.key.toLowerCase()==='s'&&revealed&&state.currentSession){const w=byId.get(state.currentSession.ids[state.currentSession.index]);if(w)speak(w.exampleDe);}
});
window.addEventListener('hashchange',()=>{revealed=false;render();});
document.querySelector('#settingsButton').addEventListener('click',openSettings);
document.querySelector('#speechRate').addEventListener('input',event=>document.querySelector('#speechRateOutput').textContent=`${Number(event.target.value).toFixed(2)}×`);
document.querySelector('#saveSettings').addEventListener('click',()=>{state.settings.dailyTarget=Number(document.querySelector('#dailyTarget').value);state.settings.speechRate=Number(document.querySelector('#speechRate').value);state.settings.listenFirst=document.querySelector('#listenFirst').checked;saveState();showToast('Settings saved.');setTimeout(render,0);});
document.querySelector('#exportButton').addEventListener('click',exportProgress);
document.querySelector('#importInput').addEventListener('change',event=>event.target.files[0]&&importProgress(event.target.files[0]));
document.querySelector('#resetButton').addEventListener('click',resetProgress);

async function init(){
  try{const response=await fetch('./content/catalog.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();catalog=data.words;byId=new Map(catalog.map(word=>[word.id,word]));if(!location.hash)location.hash='#/learn';render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}catch(error){app.innerHTML=`<div class="error-state"><h1>Vocabulary could not load</h1><p>${esc(error.message)}. Reload the page while online.</p><button class="button primary" onclick="location.reload()">Reload</button></div>`;}
}
init();
