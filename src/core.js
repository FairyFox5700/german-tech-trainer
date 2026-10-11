const DAY_MS = 86_400_000;

export function normalizeTerm(value='') {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

export function hash32(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function localDateKey(date=new Date(), timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function eligibleWords(catalog, filters={}) {
  const levels = filters.levels?.length ? new Set(filters.levels) : null;
  const domains = filters.domains?.length ? new Set(filters.domains) : null;
  const seenTerms = new Set();
  return catalog
    .filter(word => word?.id && word?.term && word.status !== 'deprecated')
    .filter(word => !levels || levels.has(word.level))
    .filter(word => !domains || domains.has(word.domain))
    .filter(word => {
      const key = normalizeTerm(word.term);
      if (seenTerms.has(key)) return false;
      seenTerms.add(key);
      return true;
    });
}

function dueTimestamp(card) {
  const value = Date.parse(card?.dueAt || '');
  return Number.isFinite(value) ? value : Infinity;
}

export function selectDailySet(catalog, cards={}, dateKey, target=10, filters={}) {
  const words = eligibleWords(catalog, filters);
  const cutoff = Date.parse(`${dateKey}T23:59:59.999Z`);
  const due = words
    .filter(word => cards[word.id] && dueTimestamp(cards[word.id]) <= cutoff)
    .sort((a,b) => dueTimestamp(cards[a.id]) - dueTimestamp(cards[b.id]) || a.id.localeCompare(b.id));
  const dueIds = due.map(word => word.id);
  const unseen = words
    .filter(word => !cards[word.id] && !dueIds.includes(word.id))
    .sort((a,b) => hash32(`daily-v1|${dateKey}|${a.id}`) - hash32(`daily-v1|${dateKey}|${b.id}`) || a.id.localeCompare(b.id));
  const future = words
    .filter(word => cards[word.id] && !dueIds.includes(word.id))
    .sort((a,b) => hash32(`fallback-v1|${dateKey}|${a.id}`) - hash32(`fallback-v1|${dateKey}|${b.id}`) || a.id.localeCompare(b.id));
  return [...dueIds, ...unseen.map(word=>word.id), ...future.map(word=>word.id)].slice(0, target);
}

export function selectMore(catalog, shownIds=[], count=10, seed='extra', filters={}) {
  const shown = new Set(shownIds);
  return eligibleWords(catalog, filters)
    .filter(word => !shown.has(word.id))
    .sort((a,b) => hash32(`${seed}|${a.id}`) - hash32(`${seed}|${b.id}`) || a.id.localeCompare(b.id))
    .slice(0, count)
    .map(word => word.id);
}

function addMinutes(iso, minutes) {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function addDays(iso, days) {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

export function scheduleReview(previous={}, rating, now=new Date().toISOString()) {
  const card = {
    status: previous.status || 'new',
    intervalDays: previous.intervalDays || 0,
    ease: previous.ease || 2.5,
    repetitions: previous.repetitions || 0,
    lapses: previous.lapses || 0,
    correct: previous.correct || 0,
    incorrect: previous.incorrect || 0
  };

  if (rating === 'again') {
    return {...card, status:'relearning', intervalDays:0, repetitions:0,
      lapses:card.lapses+1, incorrect:card.incorrect+1, lastReviewedAt:now,
      dueAt:addMinutes(now,10)};
  }

  let intervalDays;
  let ease = card.ease;
  if (rating === 'hard') {
    intervalDays = card.intervalDays ? Math.max(card.intervalDays, Math.ceil(card.intervalDays * 1.2)) : 1;
    ease = Math.max(1.3, card.ease - 0.15);
  } else if (rating === 'easy') {
    intervalDays = card.intervalDays ? Math.max(card.intervalDays + 1, Math.round(card.intervalDays * card.ease * 1.3)) : 4;
    ease = Math.min(3, card.ease + 0.1);
  } else {
    intervalDays = card.repetitions === 0 ? 1 : card.repetitions === 1 ? 3 : Math.max(card.intervalDays + 1, Math.round(card.intervalDays * card.ease));
  }

  return {...card, status:'review', intervalDays, ease, repetitions:card.repetitions+1,
    correct:card.correct+1, lastReviewedAt:now, dueAt:addDays(now,intervalDays)};
}

export function toggleSaved(savedIds=[], id, remove=false) {
  const unique=[...new Set(savedIds)];
  if(remove) return unique.filter(savedId=>savedId!==id);
  return unique.includes(id) ? unique : [...unique,id];
}

export function aggregateProgress(activity={}, now=new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay()+6)%7));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const collect = start => {
    const result = {studied:0, correct:0, seconds:0, activeDays:0, accuracy:0};
    for (const [key, value] of Object.entries(activity)) {
      const date = new Date(`${key}T00:00:00`);
      if (date >= start && date <= today) {
        result.studied += value.studied || 0;
        result.correct += value.correct || 0;
        result.seconds += value.seconds || 0;
        if ((value.studied || 0) > 0) result.activeDays++;
      }
    }
    result.accuracy = result.studied ? Math.round(result.correct / result.studied * 100) : 0;
    return result;
  };
  return {week:collect(weekStart), month:collect(monthStart)};
}
