import {readFile} from 'node:fs/promises';
import {normalizeTerm} from '../src/core.js';

const file = new URL('../content/catalog.json', import.meta.url);
const data = JSON.parse(await readFile(file, 'utf8'));
const errors = [];
if (data.schemaVersion !== 1) errors.push('schemaVersion must be 1');
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
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Catalog valid: ${data.words.length} unique B2/C1 technical entries (${data.catalogVersion})`);
