const DEVANAGARI_RANGE = /[\u0900-\u097F]/;

const DEVANAGARI_DIGITS = {
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
};

const DEVANAGARI_TO_LATIN = {
  'अ': 'a',
  'आ': 'aa',
  'इ': 'i',
  'ई': 'ii',
  'उ': 'u',
  'ऊ': 'uu',
  'ऋ': 'ri',
  'ए': 'e',
  'ऐ': 'ai',
  'ओ': 'o',
  'औ': 'au',
  'क': 'k',
  'ख': 'kh',
  'ग': 'g',
  'घ': 'gh',
  'ङ': 'ng',
  'च': 'ch',
  'छ': 'chh',
  'ज': 'j',
  'झ': 'jh',
  'ञ': 'ny',
  'ट': 't',
  'ठ': 'th',
  'ड': 'd',
  'ढ': 'dh',
  'ण': 'n',
  'त': 't',
  'थ': 'th',
  'द': 'd',
  'ध': 'dh',
  'न': 'n',
  'प': 'p',
  'फ': 'ph',
  'ब': 'b',
  'भ': 'bh',
  'म': 'm',
  'य': 'y',
  'र': 'r',
  'ल': 'l',
  'व': 'v',
  'श': 'sh',
  'ष': 'sh',
  'स': 's',
  'ह': 'h',
  'ळ': 'l',
  'ा': 'a',
  'ि': 'i',
  'ी': 'i',
  'ु': 'u',
  'ू': 'u',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  '्': '',
  'ं': 'n',
  'ँ': 'n',
  'ः': 'h',
  '़': '',
};

const TOKEN_ALIASES = new Map([
  ['stn', 'station'],
  ['sta', 'station'],
  ['jn', 'junction'],
  ['jnct', 'junction'],
  ['jct', 'junction'],
  ['rd', 'road'],
  ['hwy', 'highway'],
  ['hosp', 'hospital'],
  ['petrolpump', 'fuel'],
  ['petrol', 'fuel'],
  ['diesel', 'fuel'],
  ['ev', 'charging'],
  ['charger', 'charging'],
  ['allahabad', 'prayagraj'],
  ['ilahabad', 'prayagraj'],
  ['prayag', 'prayagraj'],
  ['इलाहाबाद', 'prayagraj'],
  ['प्रयागराज', 'prayagraj'],
]);

const PHRASE_ALIASES = new Map([
  ['allahabad station', 'prayagraj station'],
  ['allahabad junction', 'prayagraj junction'],
  ['prayagraj railway', 'prayagraj station'],
  ['इलाहाबाद जंक्शन', 'prayagraj junction'],
  ['इलाहाबाद स्टेशन', 'prayagraj station'],
  ['प्रयागराज रेलवे', 'prayagraj station'],
]);

function replaceDevanagariDigits(value) {
  return value.replace(/[०-९]/g, (digit) => DEVANAGARI_DIGITS[digit] || digit);
}

function transliterateDevanagari(value) {
  let output = '';
  for (const char of value) {
    output += DEVANAGARI_TO_LATIN[char] ?? char;
  }
  return output;
}

function stripDiacritics(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function cleanPunctuation(value) {
  return value
    .replace(/['`".,;:/\\|()[\]{}!?+-]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSearchText(value = '') {
  if (!value) return '';
  const withDigits = replaceDevanagariDigits(value);
  const transliterated = DEVANAGARI_RANGE.test(withDigits)
    ? transliterateDevanagari(withDigits)
    : withDigits;
  const stripped = stripDiacritics(transliterated).toLowerCase();
  return cleanPunctuation(stripped);
}

export function tokenizeNormalized(normalized = '') {
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

export function canonicalizeTokens(tokens = []) {
  return tokens.map((token) => TOKEN_ALIASES.get(token) || token);
}

export function normalizeAndTokenize(value = '') {
  return canonicalizeTokens(tokenizeNormalized(normalizeSearchText(value)));
}

export function expandQueryVariants(query = '') {
  const variants = new Set();
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];

  variants.add(normalized);
  if (PHRASE_ALIASES.has(normalized)) {
    variants.add(PHRASE_ALIASES.get(normalized));
  }

  const canonicalTokens = canonicalizeTokens(tokenizeNormalized(normalized));
  const canonicalPhrase = canonicalTokens.join(' ');
  variants.add(canonicalPhrase);

  if (PHRASE_ALIASES.has(canonicalPhrase)) {
    variants.add(PHRASE_ALIASES.get(canonicalPhrase));
  }

  for (const [source, target] of PHRASE_ALIASES.entries()) {
    if (canonicalPhrase.includes(source)) {
      variants.add(canonicalPhrase.replace(source, target));
    }
    if (canonicalPhrase.includes(target)) {
      variants.add(canonicalPhrase.replace(target, source));
    }
  }

  return [...variants].filter(Boolean);
}

export function makePhoneticKey(token = '') {
  if (!token) return '';
  const normalized = token.toUpperCase().replace(/[^A-Z]/g, '');
  if (!normalized) return '';

  const first = normalized[0];
  const groups = {
    B: '1',
    F: '1',
    P: '1',
    V: '1',
    C: '2',
    G: '2',
    J: '2',
    K: '2',
    Q: '2',
    S: '2',
    X: '2',
    Z: '2',
    D: '3',
    T: '3',
    L: '4',
    M: '5',
    N: '5',
    R: '6',
  };

  let output = first;
  let previousCode = groups[first] || '';

  for (let index = 1; index < normalized.length && output.length < 4; index += 1) {
    const char = normalized[index];
    const code = groups[char] || '';
    if (!code || code === previousCode) {
      previousCode = code;
      continue;
    }
    output += code;
    previousCode = code;
  }

  return output.padEnd(4, '0');
}
