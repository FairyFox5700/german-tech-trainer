import {readFile} from 'node:fs/promises';
import {normalizeTerm} from '../src/core.js';

const readJson = async name => JSON.parse(await readFile(new URL(`../content/${name}`, import.meta.url), 'utf8'));
const [data, grammar, listening, resources] = await Promise.all([
  readJson('catalog.json'), readJson('grammar.json'), readJson('listening-plan.json'), readJson('resources.json')
]);
const errors = [];
if (data.schemaVersion !== 1) errors.push('catalog schemaVersion must be 1');
if (!Array.isArray(data.words) || data.words.length < 150) errors.push('catalog must contain at least 150 words');
const ids = new Set();
const terms = new Set();
for (const [index, word] of (data.words || []).entries()) {
  const at = `words[${index}]`;
  for (const field of ['id','term','translation','level','domain','exampleDe','exampleEn','definitionDe']) {
    if (!word[field] || typeof word[field] !== 'string') errors.push(`${at}.${field} is required`);
  }
  if (!['B2','C1'].includes(word.level)) errors.push(`${at}.level must be B2 or C1`);
  if (ids.has(word.id)) errors.push(`duplicate id: ${word.id}`); else ids.add(word.id);
  const normalized = normalizeTerm(word.term || '');
  if (terms.has(normalized)) errors.push(`duplicate term: ${word.term}`); else terms.add(normalized);
  if (word.partOfSpeech === 'noun' && !word.plural) errors.push(`${at}.plural required for noun`);
}

if (grammar.schemaVersion !== 1) errors.push('grammar schemaVersion must be 1');
if (!Array.isArray(grammar.exercises) || grammar.exercises.length < 40) errors.push('grammar must contain at least 40 exercises');
const grammarLevels = new Map(['A1','B1','B2','C1'].map(level=>[level,0]));
for (const [index, exercise] of (grammar.exercises || []).entries()) {
  const at=`exercises[${index}]`;
  for (const field of ['id','level','topic','title','promptDe','answerDe','explanationEn']) {
    if (!exercise[field] || typeof exercise[field] !== 'string') errors.push(`${at}.${field} is required`);
  }
  if (!grammarLevels.has(exercise.level)) errors.push(`${at}.level must be A1, B1, B2, or C1`);
  else grammarLevels.set(exercise.level,grammarLevels.get(exercise.level)+1);
  if (ids.has(exercise.id)) errors.push(`duplicate id across content: ${exercise.id}`); else ids.add(exercise.id);
}
for(const [level,count] of grammarLevels)if(count<10)errors.push(`grammar needs at least 10 ${level} exercises`);

if (listening.schemaVersion !== 1) errors.push('listening schemaVersion must be 1');
if (!Array.isArray(listening.days) || listening.days.length !== 7) errors.push('listening plan must contain exactly 7 days');
const dayIds=new Set();
for (const [index, day] of (listening.days || []).entries()) {
  const at=`days[${index}]`;
  if(day.day!==index+1)errors.push(`${at}.day must be ${index+1}`);
  for(const field of ['id','focus','task','title','url'])if(!day[field]||typeof day[field]!=='string')errors.push(`${at}.${field} is required`);
  if(!Number.isInteger(day.minutes)||day.minutes<1)errors.push(`${at}.minutes must be positive`);
  if(!Array.isArray(day.steps)||day.steps.length<3)errors.push(`${at}.steps must contain at least 3 tasks`);
  if(dayIds.has(day.id))errors.push(`duplicate listening id: ${day.id}`);else dayIds.add(day.id);
  try{const url=new URL(day.url);if(url.hostname!=='www.youtube.com'||url.protocol!=='https:')errors.push(`${at}.url must be an HTTPS YouTube watch URL`);}catch{errors.push(`${at}.url is invalid`);}
}

if (resources.schemaVersion !== 1) errors.push('resources schemaVersion must be 1');
if (!Array.isArray(resources.resources) || resources.resources.length !== 8) errors.push('resources must contain exactly 8 curated links');
const resourceIds=new Set();
for(const [index,resource] of (resources.resources||[]).entries()){
  const at=`resources[${index}]`;
  for(const field of ['id','provider','category','title','description','action','url','level'])if(!resource[field]||typeof resource[field]!=='string')errors.push(`${at}.${field} is required`);
  if(resource.level!=='B2')errors.push(`${at}.level must be B2`);
  if(resourceIds.has(resource.id))errors.push(`duplicate resource id: ${resource.id}`);else resourceIds.add(resource.id);
  try{const url=new URL(resource.url);if(url.protocol!=='https:')errors.push(`${at}.url must use HTTPS`);}catch{errors.push(`${at}.url is invalid`);}
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Content valid: ${data.words.length} vocabulary terms, ${grammar.exercises.length} grammar exercises, ${listening.days.length} listening days, ${resources.resources.length} external resources (${data.catalogVersion})`);
