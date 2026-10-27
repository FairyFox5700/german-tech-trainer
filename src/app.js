import {selectDailySet, selectMore, scheduleReview, aggregateProgress, localDateKey, toggleSaved, parsePracticeCount, togglePlanCompletion} from './core.js';

const STORAGE_KEY = 'werkwort.state.v1';
const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let catalog = [];
let grammar = [];
let listeningPlan = [];
let byId = new Map();
let revealed = false;
let answerLock = false;
let sessionStartedAt = Date.now();

const defaultState = () => ({
  schemaVersion:1,
  settings:{dailyTarget:10,practiceCount:10,speechRate:0.9,listenFirst:false,levels:['B2','C1'],domains:[]},
  cards:{}, dailySets:{}, activity:{}, savedIds:[], currentSession:null, practiceCounter:0,
  telcB2Listening:{completedDayIds:[]}
});

function loadState(){
  try {
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(!parsed || parsed.schemaVersion!==1) return defaultState();
    return {...defaultState(),...parsed,settings:{...defaultState().settings,...parsed.settings},telcB2Listening:{...defaultState().telcB2Listening,...parsed.telcB2Listening}};
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
function isSaved(id){return state.savedIds.includes(id);}
function savedWords(){return state.savedIds.map(id=>byId.get(id)).filter(Boolean);}
function savedDashboard(){
  const words=savedWords().slice(-4).reverse();
  return `<section class="card saved-dashboard"><div class="saved-head"><div><p class="eyebrow">Your collection</p><h2>Saved words</h2><p>Keep important terms together and practise them whenever you want.</p></div><b>${state.savedIds.length}</b></div>${words.length?`<div class="saved-preview">${words.map(word=>`<div><span lang="de">${esc(word.term)}</span><small>${esc(word.translation)} · ${word.level}</small></div>`).join('')}</div>`:`<div class="empty saved-empty">Save a word from a learning card or the library. It will appear here.</div>`}<div class="actions"><a class="button" href="#/library?saved=1">View saved words</a><button class="button secondary" data-action="practice-saved" ${words.length?'':'disabled'}>Practise saved words</button></div></section>`;
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
function listeningDashboard(){
  if(!listeningPlan.length)return '';
  const completed=togglePlanCompletion(state.telcB2Listening?.completedDayIds,'',false,listeningPlan.map(day=>day.id));
  const todayIndex=(new Date().getDay()+6)%7;
  return `<section class="card listening-plan"><div class="listening-head"><div><p class="eyebrow">7-day plan · TELC B2</p><h2>Daily listening practice</h2><p>One focused YouTube exercise per day. Completion is stored only in this browser.</p></div><b>${completed.length} / 7</b></div><div class="listening-days">${listeningPlan.map((day,index)=>{const done=completed.includes(day.id);return `<article class="listening-day ${done?'done':''} ${index===todayIndex?'today':''}"><div class="day-number">Day ${day.day}${index===todayIndex?' · Today':''}</div><h3>${esc(day.focus)}</h3><p>${esc(day.task)}</p><small>${day.minutes} min · YouTube requires internet</small><details><summary>Practice steps</summary><ol>${day.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol></details><div class="actions"><a class="button primary" href="${esc(day.url)}" target="_blank" rel="noopener noreferrer">Open video</a><label class="complete-check"><input type="checkbox" data-listening-id="${esc(day.id)}" ${done?'checked':''}> <span>${done?'Completed':'Mark complete'}</span></label></div></article>`;}).join('')}</div><p class="muted listening-note">Independent exam-style practice. WerkWort is not affiliated with telc gGmbH.</p></section>`;
}

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
  </div>${listeningDashboard()}${savedDashboard()}`;
}
function dueIds(){const now=Date.now();return catalog.filter(word=>state.cards[word.id]&&Date.parse(state.cards[word.id].dueAt)<=now).map(word=>word.id);}
function startDaily(){
  const set=ensureDaily();const remaining=set.ids.filter(id=>!set.completedIds.includes(id));
  if(!remaining.length){showToast('Today’s set is complete. Starting extra practice instead.');return startExtraPractice();}
  state.currentSession={type:'daily',kind:'vocabulary',presentation:state.settings.listenFirst?'listening':'standard',ids:remaining,index:0,startedAt:new Date().toISOString()};revealed=false;sessionStartedAt=Date.now();saveState();render();
}
function startExtraPractice(){
  const shown=ensureDaily().ids;
  const count=state.settings.practiceCount||10;
  let ids=selectMore(catalog,shown,count,`extra-${today()}-${state.practiceCounter}`,state.settings);
  if(!ids.length)ids=selectMore(catalog,[],count,`review-${today()}-${state.practiceCounter}`,state.settings);
  state.practiceCounter++;state.currentSession={type:'practice',kind:'vocabulary',presentation:'standard',ids,index:0,startedAt:new Date().toISOString()};revealed=false;sessionStartedAt=Date.now();saveState();location.hash='#/practice';render();
}
function startSavedPractice(){
  const ids=state.savedIds.filter(id=>byId.has(id)).slice(0,state.settings.practiceCount||20);
  if(!ids.length){showToast('Save a few words first.');return;}
  state.currentSession={type:'practice',kind:'vocabulary',presentation:'standard',ids,index:0,startedAt:new Date().toISOString()};revealed=false;sessionStartedAt=Date.now();saveState();location.hash='#/practice';render();
}

function renderSession(){
  const session=state.currentSession;if(!session)return currentRoute()==='practice'?renderPractice():renderLearn();
  if(session.index>=session.ids.length)return renderCompletion(session.type);
  const item=byId.get(session.ids[session.index]);
  if(!item){session.index++;saveState();return renderSession();}
  const kind=session.kind||'vocabulary',isGrammar=kind==='grammar';
  const pct=Math.round(session.index/session.ids.length*100);
  const hideTerm=!isGrammar&&session.presentation==='listening'&&!revealed;
  const front=isGrammar?item.promptDe:item.term;
  app.innerHTML=`<section class="card session-card ${isGrammar?'grammar-session':''}">
    <div class="session-top"><div><span class="badge">${esc(isGrammar?item.topic:item.domain)}</span> <span class="badge level">${esc(item.level)}</span></div><span class="counter">${session.index+1} / ${session.ids.length}</span></div>
    <div class="progress-line" aria-label="Session progress ${pct}%"><i style="width:${pct}%"></i></div>
    <div class="word-area ${hideTerm?'listen-first':''}"><p class="eyebrow">${isGrammar?'Complete the sentence':hideTerm?'Listen first':'German term'}</p><h2 id="cardHeading" tabindex="-1" lang="de">${hideTerm?'Listen to reveal':esc(front)}</h2>${isGrammar?`<div class="grammar">${esc(item.title)}</div>`:`<div class="grammar">Noun · plural: <span lang="de">${esc(item.plural)}</span></div>
      <div class="audio-row"><button class="audio-button" data-speak="word" aria-label="Play German pronunciation for ${esc(item.term)}">Play word</button>${revealed?`<button class="audio-button" data-speak="sentence" aria-label="Play German example sentence">Play sentence</button>`:''}<button class="audio-button save-button ${isSaved(item.id)?'saved':''}" data-save-id="${esc(item.id)}">${isSaved(item.id)?'Saved':'Save word'}</button><button class="audio-button" data-action="stop-audio">Stop audio</button></div>`}
    </div>
    ${revealed?`<div class="reveal-panel">${isGrammar?`<div class="translation" lang="de">${esc(item.answerDe)}</div><p class="example-en">${esc(item.explanationEn)}</p>`:`<div class="translation">${esc(item.translation)}</div><p class="example-de" lang="de">${esc(item.exampleDe)}</p><p class="example-en">${esc(item.exampleEn)}</p>`}<div class="rating-grid" aria-label="How well did you remember?"><button class="rating" data-rating="again">Again<small>10 min</small></button><button class="rating" data-rating="hard">Hard<small>shorter</small></button><button class="rating" data-rating="good">Good<small>normal</small></button><button class="rating" data-rating="easy">Easy<small>longer</small></button></div></div>`:`<div class="actions"><button class="button primary" data-action="reveal">Reveal answer</button><button class="button" data-action="pause">Pause session</button></div>`}
  </section>`;
  requestAnimationFrame(()=>{fitCardHeading();document.querySelector('#cardHeading')?.focus({preventScroll:true});});
}
function fitCardHeading(){
  const heading=document.querySelector('#cardHeading');if(!heading)return;
  heading.classList.remove('single-line-fit');heading.style.removeProperty('font-size');
  if(innerWidth>640||heading.closest('.grammar-session'))return;
  heading.classList.add('single-line-fit');
  let size=parseFloat(getComputedStyle(heading).fontSize);
  while(heading.scrollWidth>heading.clientWidth&&size>18){size-=.5;heading.style.fontSize=`${size}px`;}
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
  const session=state.currentSession,count=session?.ids.length||0,kind=session?.kind||'vocabulary';state.currentSession=null;saveState();
  app.innerHTML=`<section class="card complete"><span class="badge">${type==='daily'?'Daily set complete':`${kind==='grammar'?'Grammar':'Vocabulary'} practice complete`}</span><h2>Gut gemacht.</h2><p>You reviewed ${count} ${kind==='grammar'?'German sentence':'technical German term'}${count===1?'':'s'}. Your review queue has been updated.</p><div class="actions"><a class="button primary" href="#/practice">Build another session</a><a class="button" href="#/progress">View progress</a></div></section>`;
}

function renderPractice(){
  if(state.currentSession?.type==='practice'&&!state.currentSession.paused)return renderSession();
  const domains=[...new Set(catalog.map(x=>x.domain))].sort();
  const topics=[...new Set(grammar.map(x=>x.topic))].sort();
  const resume=state.currentSession?.type==='practice'&&state.currentSession.paused?`<section class="card resume-card"><div><p class="eyebrow">Paused session</p><h2>${state.currentSession.kind==='grammar'?'Grammar':'Vocabulary'} · ${state.currentSession.index+1} / ${state.currentSession.ids.length}</h2></div><div class="actions"><button class="button primary" data-action="resume-session">Resume</button><button class="button" data-action="discard-session">Discard</button></div></section>`:'';
  app.innerHTML=pageHeader('Optional practice','Build your session','Choose vocabulary or active grammar, CEFR level, topic, and any length from 1 to 100.')+resume+`
  <div class="config-grid">
    <section class="card config-card"><h2>Practice cards</h2><form id="practiceForm" class="form-grid" novalidate>
      <label>Content<select name="kind" id="practiceKind"><option value="vocabulary">Vocabulary flashcards</option><option value="grammar">Active grammar sentences</option></select></label>
      <label>Mode<select name="mode" id="practiceMode"><option value="mixed">Mixed</option><option value="saved" data-vocabulary-only>Saved words</option><option value="due">Due reviews</option><option value="weak">Weak cards</option><option value="new">New cards</option><option value="listening" data-vocabulary-only>Listening first</option></select></label>
      <label data-vocabulary-field>Technical field<select name="domain"><option value="">All fields</option>${domains.map(d=>`<option>${esc(d)}</option>`).join('')}</select></label>
      <label data-grammar-field hidden>Grammar topic<select name="topic"><option value="">All topics</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label>
      <div><label>Level</label><div class="filter-chips"><label><input type="checkbox" name="level" value="A1" data-grammar-level disabled><span>A1</span></label><label><input type="checkbox" name="level" value="B1" data-grammar-level disabled><span>B1</span></label><label><input type="checkbox" name="level" value="B2" checked><span>B2</span></label><label><input type="checkbox" name="level" value="C1" checked><span>C1</span></label></div></div>
      <label>Session length<input name="count" id="practiceCount" type="number" min="1" max="100" step="1" inputmode="numeric" value="${state.settings.practiceCount||10}" aria-describedby="countHelp countError"><small id="countHelp" class="muted">Choose 1–100. If fewer cards match, all available cards are used.</small><span id="countError" class="field-error" role="alert"></span></label>
      <button class="button primary" type="submit">Start practice</button>
    </form></section>
    <section class="card config-card"><h2>Available practice</h2><div class="metric-row"><span>Grammar sentences</span><b>${grammar.length}</b></div><div class="metric-row"><span>Vocabulary terms</span><b>${catalog.length}</b></div><div class="metric-row"><span>Due now</span><b>${dueIds().length}</b></div><p class="muted">Grammar content is original CEFR-aligned practice and is not copied from the Grammatik aktiv books. Listening mode applies only to the session you start.</p></section>
  </div>`;
}
function syncPracticeForm(){
  const form=document.querySelector('#practiceForm');if(!form)return;
  const grammarMode=form.elements.kind.value==='grammar';
  form.querySelectorAll('[data-vocabulary-field]').forEach(el=>el.hidden=grammarMode);
  form.querySelectorAll('[data-grammar-field]').forEach(el=>el.hidden=!grammarMode);
  form.querySelectorAll('[data-grammar-level]').forEach(input=>{input.disabled=!grammarMode;if(grammarMode)input.checked=true;else input.checked=false;});
  form.querySelectorAll('[data-vocabulary-only]').forEach(option=>option.disabled=grammarMode);
  if(grammarMode&&['saved','listening'].includes(form.elements.mode.value))form.elements.mode.value='mixed';
}
function submitPractice(form){
  const data=new FormData(form),kind=data.get('kind'),mode=data.get('mode'),count=parsePracticeCount(data.get('count')),levels=data.getAll('level');
  const countInput=form.elements.count,error=form.querySelector('#countError');error.textContent='';
  if(count===null){error.textContent='Enter a whole number from 1 to 100.';countInput.focus();return;}
  if(!levels.length){showToast('Choose at least one CEFR level.');return;}
  const source=kind==='grammar'?grammar:catalog,topic=kind==='grammar'?data.get('topic'):data.get('domain');
  const filters={levels,domains:topic?[topic]:[]};let pool=source;
  if(topic)pool=pool.filter(x=>(kind==='grammar'?x.topic:x.domain)===topic);
  if(mode==='due')pool=pool.filter(x=>state.cards[x.id]&&Date.parse(state.cards[x.id].dueAt)<=Date.now());
  if(mode==='weak')pool=pool.filter(x=>cardStatus(x.id)==='Weak');
  if(mode==='new')pool=pool.filter(x=>!state.cards[x.id]);
  if(mode==='saved')pool=pool.filter(x=>state.savedIds.includes(x.id));
  const ids=selectMore(pool,[],count,`${kind}-${today()}-${state.practiceCounter}`,{levels,domains:[]});
  if(!ids.length){showToast(`No ${kind} cards match those filters. Try Mixed or another level.`);return;}
  state.practiceCounter++;state.settings.practiceCount=count;
  state.currentSession={type:'practice',kind,presentation:mode==='listening'?'listening':'standard',ids,index:0,startedAt:new Date().toISOString()};revealed=false;sessionStartedAt=Date.now();saveState();
  if(ids.length<count)showToast(`Only ${ids.length} cards matched, so this session uses all of them.`);
  render();
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
  const params=new URLSearchParams(location.hash.split('?')[1]||''),q=params.get('q')||'',level=params.get('level')||'',domain=params.get('domain')||'',savedOnly=params.get('saved')==='1';
  const domains=[...new Set(catalog.map(x=>x.domain))].sort();
  const visible=catalog.filter(word=>(!q||`${word.term} ${word.translation} ${word.exampleDe}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()))&&(!level||word.level===level)&&(!domain||word.domain===domain)&&(!savedOnly||isSaved(word.id)));
  app.innerHTML=pageHeader('Reference','Vocabulary library',`${visible.length} of ${catalog.length} technical terms. Search German, English, or example sentences.`)+`
  <div class="library-tools"><input id="librarySearch" type="search" value="${esc(q)}" placeholder="Search vocabulary…" aria-label="Search vocabulary"><select id="libraryLevel" aria-label="Filter by level"><option value="">All levels</option><option ${level==='B2'?'selected':''}>B2</option><option ${level==='C1'?'selected':''}>C1</option></select><select id="libraryDomain" aria-label="Filter by field"><option value="">All fields</option>${domains.map(d=>`<option ${domain===d?'selected':''}>${esc(d)}</option>`).join('')}</select><a class="button ${savedOnly?'primary':''}" href="#/library${savedOnly?'':'?saved=1'}">${savedOnly?'Show all':`Saved (${state.savedIds.length})`}</a></div>
  <div class="library-list">${visible.length?visible.map(word=>`<article class="word-row"><div><strong lang="de">${esc(word.term)}</strong><small>Plural: <span lang="de">${esc(word.plural)}</span></small></div><div class="meaning">${esc(word.translation)}</div><div class="domain">${esc(word.domain)}</div><div class="status-pill">${word.level} · ${cardStatus(word.id)}</div><div class="row-actions"><button class="audio-button" data-library-speak="${esc(word.id)}" aria-label="Play pronunciation for ${esc(word.term)}">Play</button><button class="audio-button save-button ${isSaved(word.id)?'saved':''}" data-save-id="${esc(word.id)}">${isSaved(word.id)?'Saved':'Save'}</button></div></article>`).join(''):`<div class="empty">${savedOnly?'No saved words yet. Save terms from a card or the full library.':'No vocabulary matches these filters.'}</div>`}</div>`;
}
function updateLibraryHash(){const q=document.querySelector('#librarySearch')?.value||'',level=document.querySelector('#libraryLevel')?.value||'',domain=document.querySelector('#libraryDomain')?.value||'',saved=new URLSearchParams(location.hash.split('?')[1]||'').get('saved')||'';location.hash=`#/library?${new URLSearchParams({q,level,domain,saved})}`;}

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
async function importProgress(file){try{const parsed=JSON.parse(await file.text());if(parsed.schemaVersion!==1||typeof parsed.cards!=='object'||typeof parsed.activity!=='object')throw new Error();state={...defaultState(),...parsed,settings:{...defaultState().settings,...parsed.settings},telcB2Listening:{...defaultState().telcB2Listening,...parsed.telcB2Listening}};saveState();document.querySelector('#settingsDialog').close();showToast('Progress imported.');render();}catch{showToast('That file is not a valid WerkWort export.');}}
function resetProgress(){if(!confirm('Delete all WerkWort progress and settings from this browser?'))return;localStorage.removeItem(STORAGE_KEY);state=defaultState();document.querySelector('#settingsDialog').close();saveState();showToast('Local progress reset.');render();}

function render(){setActiveNav();stopAudio();const route=currentRoute();if(route==='learn')renderLearn();if(route==='practice'){renderPractice();syncPracticeForm();}if(route==='progress')renderProgress();if(route==='library')renderLibrary();updateStreak();}

app.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='start-daily')startDaily();
  if(action==='practice-more')startExtraPractice();
  if(action==='practice-saved')startSavedPractice();
  if(action==='reveal'){revealed=true;renderSession();}
  if(action==='pause'){if(state.currentSession.type==='daily')state.currentSession=null;else state.currentSession.paused=true;saveState();render();}
  if(action==='resume-session'){state.currentSession.paused=false;sessionStartedAt=Date.now();saveState();render();}
  if(action==='discard-session'){state.currentSession=null;saveState();render();}
  if(action==='stop-audio')stopAudio();
  const rating=event.target.closest('[data-rating]')?.dataset.rating;if(rating)answer(rating);
  const speakKind=event.target.closest('[data-speak]')?.dataset.speak;if(speakKind){const session=state.currentSession,word=byId.get(session.ids[session.index]);speak(speakKind==='word'?word.speechText:word.exampleDe);}
  const libraryId=event.target.closest('[data-library-speak]')?.dataset.librarySpeak;if(libraryId)speak(byId.get(libraryId)?.speechText||'');
  const saveId=event.target.closest('[data-save-id]')?.dataset.saveId;if(saveId){const remove=isSaved(saveId);state.savedIds=toggleSaved(state.savedIds,saveId,remove);saveState();showToast(remove?'Removed from saved words.':'Saved to your dashboard.');render();}
});
app.addEventListener('submit',event=>{if(event.target.id==='practiceForm'){event.preventDefault();submitPractice(event.target);}});
app.addEventListener('input',event=>{if(event.target.id==='librarySearch'){clearTimeout(updateLibraryHash.timer);updateLibraryHash.timer=setTimeout(updateLibraryHash,220);}});
app.addEventListener('change',event=>{
  if(['libraryLevel','libraryDomain'].includes(event.target.id))updateLibraryHash();
  if(event.target.id==='practiceKind')syncPracticeForm();
  const listeningId=event.target.dataset.listeningId;if(listeningId){const valid=listeningPlan.map(day=>day.id);state.telcB2Listening.completedDayIds=togglePlanCompletion(state.telcB2Listening.completedDayIds,listeningId,event.target.checked,valid);saveState();render();}
});
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.code==='Space'&&!revealed&&state.currentSession){event.preventDefault();revealed=true;renderSession();}
  if(revealed&&['1','2','3','4'].includes(event.key))answer(['again','hard','good','easy'][Number(event.key)-1]);
  if(event.key.toLowerCase()==='p'&&state.currentSession?.kind!=='grammar'){const w=byId.get(state.currentSession.ids[state.currentSession.index]);if(w)speak(w.speechText);}
  if(event.key.toLowerCase()==='s'&&revealed&&state.currentSession?.kind!=='grammar'){const w=byId.get(state.currentSession.ids[state.currentSession.index]);if(w)speak(w.exampleDe);}
});
window.addEventListener('hashchange',()=>{revealed=false;render();});
window.addEventListener('resize',()=>requestAnimationFrame(fitCardHeading));
document.querySelector('#settingsButton').addEventListener('click',openSettings);
document.querySelector('#speechRate').addEventListener('input',event=>document.querySelector('#speechRateOutput').textContent=`${Number(event.target.value).toFixed(2)}×`);
document.querySelector('#saveSettings').addEventListener('click',()=>{state.settings.dailyTarget=Number(document.querySelector('#dailyTarget').value);state.settings.speechRate=Number(document.querySelector('#speechRate').value);state.settings.listenFirst=document.querySelector('#listenFirst').checked;saveState();showToast('Settings saved.');setTimeout(render,0);});
document.querySelector('#exportButton').addEventListener('click',exportProgress);
document.querySelector('#importInput').addEventListener('change',event=>event.target.files[0]&&importProgress(event.target.files[0]));
document.querySelector('#resetButton').addEventListener('click',resetProgress);

async function init(){
  try{
    const [catalogResponse,grammarResponse,listeningResponse]=await Promise.all([fetch('./content/catalog.json'),fetch('./content/grammar.json'),fetch('./content/listening-plan.json')]);
    if(!catalogResponse.ok||!grammarResponse.ok||!listeningResponse.ok)throw new Error('One or more study files could not be loaded');
    const [catalogData,grammarData,listeningData]=await Promise.all([catalogResponse.json(),grammarResponse.json(),listeningResponse.json()]);
    catalog=catalogData.words;grammar=grammarData.exercises;listeningPlan=listeningData.days;byId=new Map([...catalog,...grammar].map(item=>[item.id,item]));
    if(!location.hash)location.hash='#/learn';render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }catch(error){app.innerHTML=`<div class="error-state"><h1>Study content could not load</h1><p>${esc(error.message)}. Reload the page while online.</p><button class="button primary" onclick="location.reload()">Reload</button></div>`;}
}
init();
