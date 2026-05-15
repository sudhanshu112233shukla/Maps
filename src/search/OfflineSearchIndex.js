import { damerauLevenshtein } from './FuzzyMatcher.js';
import {
  canonicalizeTokens,
  expandQueryVariants,
  makePhoneticKey,
  normalizeAndTokenize,
  normalizeSearchText,
  tokenizeNormalized,
} from './SearchNormalizer.js';

const MIN_PREFIX_LENGTH = 2;
const MAX_EDIT_DISTANCE = 2;
const MAX_FUZZY_TERM_LENGTH = 32;

const CATEGORY_KEYWORDS = new Map([
  ['fuel', 'fuel'],
  ['petrol', 'fuel'],
  ['diesel', 'fuel'],
  ['gas', 'fuel'],
  ['charging', 'charging'],
  ['charger', 'charging'],
  ['ev', 'charging'],
  ['hospital', 'hospital'],
  ['clinic', 'hospital'],
  ['pharmacy', 'pharmacy'],
  ['chemist', 'pharmacy'],
  ['hotel', 'hotel'],
  ['motel', 'hotel'],
  ['restaurant', 'restaurant'],
  ['cafe', 'restaurant'],
  ['food', 'restaurant'],
  ['rest', 'rest_area'],
  ['washroom', 'rest_area'],
  ['toilet', 'rest_area'],
  ['service', 'rest_area'],
  ['station', 'station'],
  ['junction', 'station'],
  ['railway', 'station'],
]);

const QUERY_STOP_WORDS = new Set([
  'find',
  'show',
  'near',
  'nearby',
  'nearest',
  'closest',
  'around',
  'me',
  'in',
  'at',
  'on',
  'for',
]);

function addToSetMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(value);
}

function splitCategoryFromQuery(normalizedQuery) {
  const tokens = tokenizeNormalized(normalizedQuery);
  if (!tokens.length) return { category: null, remainingQuery: normalizedQuery };

  let category = null;
  const remainingTokens = [];

  tokens.forEach((token) => {
    const matchedCategory = CATEGORY_KEYWORDS.get(token);
    if (matchedCategory && !category) {
      category = matchedCategory;
      return;
    }
    if (QUERY_STOP_WORDS.has(token)) {
      return;
    }
    remainingTokens.push(token);
  });

  return {
    category,
    remainingQuery: remainingTokens.join(' ').trim(),
  };
}

export class OfflineSearchIndex {
  constructor(options = {}) {
    this.maxPrefixLength = options.maxPrefixLength || 8;
    this.documents = [];
    this.tokenToDocumentIds = new Map();
    this.prefixToDocumentIds = new Map();
    this.phoneticToDocumentIds = new Map();
    this.categoryToDocumentIds = new Map();
  }

  build(points = []) {
    this.documents = [];
    this.tokenToDocumentIds.clear();
    this.prefixToDocumentIds.clear();
    this.phoneticToDocumentIds.clear();
    this.categoryToDocumentIds.clear();

    points.forEach((point, index) => {
      const rawTokens = normalizeAndTokenize(
        `${point.name || ''} ${point.type || ''} ${(point.keywords || []).join(' ')}`,
      );
      const nameTokens = normalizeAndTokenize(point.name || '');
      const allTokens = [...new Set([...rawTokens, ...nameTokens])];
      const normalizedName = normalizeSearchText(point.name || '');

      const phoneticKeys = [...new Set(nameTokens.map((token) => makePhoneticKey(token)).filter(Boolean))];

      const document = {
        id: index,
        point,
        normalizedName,
        tokens: allTokens,
        nameTokens,
        phoneticKeys,
      };
      this.documents.push(document);
      addToSetMap(this.categoryToDocumentIds, point.type, index);

      allTokens.forEach((token) => {
        addToSetMap(this.tokenToDocumentIds, token, index);

        for (
          let prefixLength = MIN_PREFIX_LENGTH;
          prefixLength <= Math.min(this.maxPrefixLength, token.length);
          prefixLength += 1
        ) {
          addToSetMap(this.prefixToDocumentIds, token.slice(0, prefixLength), index);
        }
      });

      phoneticKeys.forEach((key) => addToSetMap(this.phoneticToDocumentIds, key, index));
    });
  }

  search(query, options = {}) {
    const limit = options.limit || 6;
    const activeRegion = options.region || null;

    const queryVariants = expandQueryVariants(query);
    if (!queryVariants.length) return [];

    const candidateIds = new Set();
    const queryTokens = new Set();
    const queryPhoneticKeys = new Set();
    const requestedCategories = new Set();

    queryVariants.forEach((variant) => {
      const { category, remainingQuery } = splitCategoryFromQuery(variant);
      if (category) requestedCategories.add(category);
      const tokens = canonicalizeTokens(tokenizeNormalized(remainingQuery));
      tokens.forEach((token) => {
        queryTokens.add(token);

        const directMatches = this.tokenToDocumentIds.get(token);
        directMatches?.forEach((id) => candidateIds.add(id));

        const prefixMatches = this.prefixToDocumentIds.get(token);
        prefixMatches?.forEach((id) => candidateIds.add(id));

        const phonetic = makePhoneticKey(token);
        if (phonetic) {
          queryPhoneticKeys.add(phonetic);
          const phoneticMatches = this.phoneticToDocumentIds.get(phonetic);
          phoneticMatches?.forEach((id) => candidateIds.add(id));
        }
      });
    });

    requestedCategories.forEach((category) => {
      const categoryMatches = this.categoryToDocumentIds.get(category);
      categoryMatches?.forEach((id) => candidateIds.add(id));
    });

    if (!candidateIds.size) {
      this.documents.forEach((document) => candidateIds.add(document.id));
    }

    const results = [...candidateIds]
      .map((id) => this.documents[id])
      .map((document) => ({
        document,
        score: this.#scoreDocument(
          document,
          queryVariants,
          queryTokens,
          queryPhoneticKeys,
          requestedCategories,
          activeRegion,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ document }) => ({
        ...document.point,
        fullName: document.point.name || '',
      }));

    return results;
  }

  #scoreDocument(
    document,
    queryVariants,
    queryTokens,
    queryPhoneticKeys,
    requestedCategories,
    activeRegion,
  ) {
    let score = 0;
    const point = document.point;

    if (activeRegion && point.region === activeRegion) {
      score += 45;
    } else if (point.type === 'city') {
      score += 20;
    }

    if (requestedCategories.size > 0) {
      if (requestedCategories.has(point.type)) {
        score += 80;
      } else {
        score -= point.type === 'city' ? 30 : 10;
      }
    }

    queryVariants.forEach((variant) => {
      if (document.normalizedName === variant) {
        score += 280;
      } else if (document.normalizedName.startsWith(variant)) {
        score += 160;
      } else if (document.normalizedName.includes(variant)) {
        score += 100;
      }

      const compactVariant = variant.replace(/\s+/g, '');
      const compactName = document.normalizedName.replace(/\s+/g, '');
      if (
        compactVariant.length > 0 &&
        compactVariant.length <= MAX_FUZZY_TERM_LENGTH &&
        compactName.length <= MAX_FUZZY_TERM_LENGTH
      ) {
        const editDistance = damerauLevenshtein(compactVariant, compactName, MAX_EDIT_DISTANCE);
        if (editDistance <= MAX_EDIT_DISTANCE) {
          score += (MAX_EDIT_DISTANCE - editDistance + 1) * 35;
        }
      }
    });

    queryTokens.forEach((token) => {
      if (document.tokens.includes(token)) {
        score += 40;
      } else if (document.tokens.some((candidate) => candidate.startsWith(token))) {
        score += 22;
      }
    });

    queryPhoneticKeys.forEach((phonetic) => {
      if (document.phoneticKeys.includes(phonetic)) {
        score += 16;
      }
    });

    return score;
  }
}
