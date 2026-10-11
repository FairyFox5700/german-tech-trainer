from pathlib import Path
import json, re, unicodedata

source = Path(r'C:\Users\tysch\Documents\German Technical Words Trainer.html').read_text(encoding='utf-8')
pattern = re.compile(r"\{f:'([^']+)',a:'([^']+)',w:'([^']+)',p:'([^']+)',e:'([^']+)',s:'([^']+)',t:'([^']+)'\}")
rows = pattern.findall(source)
complex_terms = {
    'Bereitstellung','Abhängigkeit','Durchsatz','Versionsverwaltung','Zugfestigkeit','Wärmeleitung','Strömung','Werkstoff',
    'Leitfähigkeit','Stromversorgung','Nachbearbeitung','Vorrichtung','Verschleiß','Verschlüsselung','Schwachstelle',
    'Berechtigung','Latenz','Datenverlust','Bandbreite','Erkennung'
}
domain_names = {
    'Software':'Software & IT','Engineering':'Engineering & Materials','Electrical':'Electrical Engineering',
    'Manufacturing':'Manufacturing','Data':'Data & Cybersecurity'
}

def slug(value):
    value = value.replace('ä','ae').replace('ö','oe').replace('ü','ue').replace('ß','ss')
    value = unicodedata.normalize('NFKD', value).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',value).strip('-')

words=[]
for field, article, word, plural, english, sentence_de, sentence_en in rows:
    words.append({
        'id': f"term-{slug(field)}-{slug(word)}",
        'revision': 1,
        'status': 'active',
        'term': f'{article} {word}',
        'lemma': word,
        'partOfSpeech': 'noun',
        'article': article,
        'plural': plural,
        'translation': english,
        'level': 'C1' if word in complex_terms else 'B2',
        'domain': domain_names[field],
        'definitionDe': f'Dieser Fachbegriff wird im Bereich {domain_names[field]} verwendet.',
        'exampleDe': sentence_de,
        'exampleEn': sentence_en,
        'speechText': f'{article} {word}',
        'source': {'name':'Original editorial content','license':'CC BY 4.0'}
    })

out={'schemaVersion':1,'catalogVersion':'2026.10.1','alignmentNote':'CEFR B2–C1 and Goethe-Zertifikat skill aligned; not an official Goethe-Institut word list.','words':words}
path=Path(r'C:\Users\tysch\Documents\german-tech-trainer\content\catalog.json')
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'wrote {len(words)} words to {path}')
