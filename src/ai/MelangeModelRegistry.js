import MODELS from './models.json' with { type: 'json' };

function normalizeDeviceMemoryGb(deviceMemoryGb) {
  if (Number.isFinite(deviceMemoryGb) && deviceMemoryGb > 0) {
    return deviceMemoryGb;
  }

  if (typeof navigator !== 'undefined' && Number.isFinite(navigator.deviceMemory)) {
    return navigator.deviceMemory;
  }

  return null;
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function getDeviceClass(deviceMemoryGb = null) {
  const normalizedMemory = normalizeDeviceMemoryGb(deviceMemoryGb);
  const memoryMb = normalizedMemory ? Math.round(normalizedMemory * 1024) : null;
  const entries = Object.entries(MODELS.deviceClasses || {});

  if (!entries.length) {
    return {
      key: 'default',
      memoryMb,
      profile: {
        llm: 'fallback',
        tts: 'platform',
      },
    };
  }

  const fallbackEntry = entries[entries.length - 1];
  if (!memoryMb) {
    const [key, profile] = fallbackEntry;
    return { key, memoryMb: null, profile };
  }

  const selected =
    entries.find(([, profile]) => memoryMb <= Number(profile?.maxRamMb || 0)) || fallbackEntry;
  const [key, profile] = selected;
  return { key, memoryMb, profile };
}

export function buildMelangeRuntimeConfig(options = {}) {
  const deviceClass = getDeviceClass(options.deviceMemoryGb || null);
  const primaryLlm = MODELS.llm?.primary || {};
  const fallbackLlm = MODELS.llm?.fallback || primaryLlm;
  const selectedLlm =
    deviceClass.profile?.llm === 'fallback'
      ? fallbackLlm
      : primaryLlm;
  const speechAsr = MODELS.speech?.asr || {};
  const speechTts = MODELS.speech?.tts || {};

  return {
    locale: options.locale || 'en-US',
    deviceClass: options.deviceClass || deviceClass.key,
    deviceMemoryMb: deviceClass.memoryMb,
    llmModelName: options.llmModelName || selectedLlm.id || primaryLlm.id || '',
    llmFallbackModelName: options.llmFallbackModelName || fallbackLlm.id || primaryLlm.id || '',
    speechModelName: options.speechModelName || speechAsr.id || '',
    speechEncoderModelName: options.speechEncoderModelName || speechAsr.encoder || '',
    ttsModelName:
      options.ttsModelName
      || (deviceClass.profile?.tts === 'tts' ? speechTts.id || '' : ''),
    maxGeneratedTokens: options.maxGeneratedTokens || MODELS.limits?.maxGeneratedTokens || 320,
    maxContextTurns: options.maxContextTurns || MODELS.limits?.maxContextTurns || 6,
    inferenceTimeoutMs: options.inferenceTimeoutMs || MODELS.limits?.inferenceTimeoutMs || 4500,
    voiceCommandLatencyTargetMs:
      options.voiceCommandLatencyTargetMs || MODELS.limits?.voiceCommandLatencyTargetMs || 2500,
  };
}

export function semanticRankCandidates(query, candidates = [], limit = 5) {
  const queryTokens = tokenize(query);

  return candidates
    .map((candidate, index) => {
      const haystack = [
        candidate?.name,
        candidate?.category,
        candidate?.description,
        ...(Array.isArray(candidate?.aliases) ? candidate.aliases : []),
      ]
        .filter(Boolean)
        .join(' ');
      const candidateTokens = tokenize(haystack);
      const overlap = queryTokens.filter((token) => candidateTokens.includes(token)).length;
      const distancePenalty = Number.isFinite(candidate?.distanceMeters)
        ? Math.min(candidate.distanceMeters / 5000, 10)
        : 0;
      const categoryBoost =
        candidate?.category && queryTokens.some((token) => candidate.category.toLowerCase().includes(token))
          ? 2
          : 0;
      return {
        ...candidate,
        score: overlap * 3 + categoryBoost - distancePenalty,
        _index: index,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left._index - right._index;
    })
    .slice(0, Math.max(1, limit))
    .map(({ _index, ...candidate }) => candidate);
}

export function buildPredictiveCachePlan(context = {}) {
  const route = context.route || {};
  const poi = String(context.poi || route.poi || '').toLowerCase();
  const plan = {
    regionId: context.regionId || null,
    radiusKm: context.onHighway ? 40 : 20,
    assetHints: ['graph', 'poi'],
    poiCategories: [],
    warmRouteModes: [],
  };

  if (context.regionId) {
    plan.assetHints.push(`map:${context.regionId}`);
  }

  if (route.mode) {
    plan.warmRouteModes.push(route.mode);
  }

  if (poi) {
    plan.poiCategories.push(poi);
  }

  if (context.onHighway) {
    plan.poiCategories.push('fuel', 'rest_area', 'charging');
  }

  if (context.vehicleProfile === 'automobile') {
    plan.poiCategories.push('hospital');
  }

  plan.poiCategories = [...new Set(plan.poiCategories.filter(Boolean))];
  plan.assetHints = [...new Set(plan.assetHints.filter(Boolean))];
  plan.warmRouteModes = [...new Set(plan.warmRouteModes.filter(Boolean))];
  return plan;
}

export { MODELS };
