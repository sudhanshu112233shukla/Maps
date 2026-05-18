import { MelangeNavigation } from './MelangeNavigation.js';
import {
  MODELS,
  buildMelangeRuntimeConfig,
  buildPredictiveCachePlan,
  semanticRankCandidates,
} from './MelangeModelRegistry.js';

const KNOWN_MODES = new Set(['fastest', 'safest', 'eco', 'no-toll']);
const POI_ALIASES = {
  hospital: ['hospital', 'clinic', 'doctor', 'emergency', 'aspatal', 'hospitale'],
  fuel: ['fuel', 'gas', 'gas station', 'petrol', 'petrol pump', 'diesel', 'indhan'],
  charging: ['charging', 'charger', 'ev', 'ev charger', 'battery charge', 'charging point'],
  restaurant: ['restaurant', 'food', 'eat', 'cafe', 'coffee', 'khana', 'chai'],
  hotel: ['hotel', 'stay', 'motel', 'lodge', 'rukna'],
  pharmacy: ['pharmacy', 'medicine', 'chemist', 'dawai'],
  atm: ['atm', 'cash', 'bank'],
  rest_area: ['rest area', 'toilet', 'washroom', 'service area', 'rest stop'],
};

function normalizeRoutingResult(result = {}, locale = 'en-US') {
  const language = result.language || locale.split('-')[0] || 'en';
  const mode = KNOWN_MODES.has(result.mode) ? result.mode : 'fastest';
  const avoid = Array.isArray(result.avoid)
    ? result.avoid.filter(Boolean)
    : [];

  return {
    destination: typeof result.destination === 'string' && result.destination.trim()
      ? result.destination.trim()
      : null,
    mode,
    poi: typeof result.poi === 'string' && result.poi.trim()
      ? result.poi.trim().toLowerCase()
      : null,
    language,
    avoid,
  };
}

function detectPoiFromQuery(query) {
  const lowered = query.toLowerCase();
  for (const [poi, aliases] of Object.entries(POI_ALIASES)) {
    if (aliases.some((alias) => lowered.includes(alias))) {
      return poi;
    }
  }
  return null;
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

class RuleBasedNavigationProvider {
  constructor(options = {}) {
    this.options = options;
    this.kind = 'rules';
  }

  async load(progressCallback) {
    progressCallback?.(100, 'Offline automotive assistant ready');
  }

  getLabel() {
    return 'Offline automotive assistant';
  }

  getStatus() {
    return {
      prepared: true,
      runtime: 'rules',
      supportsNativeMelange: false,
      supportsVoiceCommands: false,
      supportsSemanticSearch: true,
      supportsPredictiveCaching: true,
    };
  }

  async parseRoutingQuery(query) {
    const lowered = query.toLowerCase();
    const mode = containsAny(lowered, ['no toll', 'avoid toll', 'without toll', 'bina toll'])
      ? 'no-toll'
      : containsAny(lowered, ['eco', 'fuel efficient', 'kam fuel', 'save fuel'])
        ? 'eco'
        : containsAny(lowered, ['safe', 'safer', 'surakshit', 'night safe'])
          ? 'safest'
          : 'fastest';

    const destinationMatch = lowered.match(
      /(?:to|navigate to|take me to|directions to|route to|drive to)\s+(.+?)(?:\s+(?:avoiding|avoid|with|via|and)|$)/i,
    );

    const avoid = [];
    if (containsAny(lowered, ['avoid toll', 'no toll', 'bina toll'])) avoid.push('tolls');
    if (containsAny(lowered, ['avoid highway', 'no highway'])) avoid.push('highways');
    if (containsAny(lowered, ['avoid traffic', 'no traffic', 'jam avoid'])) avoid.push('traffic');
    if (containsAny(lowered, ['avoid night', 'night avoid'])) avoid.push('night-driving');

    return normalizeRoutingResult(
      {
        destination: destinationMatch?.[1] || null,
        mode,
        poi: detectPoiFromQuery(query),
        language: this.options.locale?.split('-')[0] || 'en',
        avoid,
      },
      this.options.locale,
    );
  }

  async chat(userMessage) {
    const lowered = userMessage.toLowerCase();
    if (lowered.includes('fuel') || lowered.includes('petrol') || lowered.includes('gas')) {
      return 'I can route to nearby fuel stops and keep you on primary roads where possible.';
    }
    if (lowered.includes('safe') || lowered.includes('night')) {
      return 'Safest mode prefers major roads and penalizes minor streets, especially during late hours.';
    }
    if (lowered.includes('offline')) {
      return 'The navigation logic, search index, and route engine are designed to keep working without network access.';
    }
    return 'Ask for a destination, a nearby stop, or a driving preference like safest, eco, or no-toll.';
  }

  async rankPoiCandidates(query, candidates = [], limit = 5) {
    return {
      items: semanticRankCandidates(query, candidates, limit),
      runtime: 'rules',
    };
  }

  async predictOfflineCache(context = {}) {
    return {
      ...buildPredictiveCachePlan(context),
      runtime: 'rules',
    };
  }
}

class NativeMelangeProvider {
  constructor(options = {}) {
    this.options = options;
    this.runtimeConfig = buildMelangeRuntimeConfig(options);
    this.kind = 'melange';
    this.metadata = {
      prepared: false,
      runtime: 'native-bridge',
      supportsNativeMelange: false,
      supportsVoiceCommands: false,
      supportsSemanticSearch: false,
      supportsPredictiveCaching: false,
      deviceClass: this.runtimeConfig.deviceClass,
      models: {
        llm: this.runtimeConfig.llmModelName,
        llmFallback: this.runtimeConfig.llmFallbackModelName,
        speech: this.runtimeConfig.speechModelName,
        speechEncoder: this.runtimeConfig.speechEncoderModelName,
        tts: this.runtimeConfig.ttsModelName || null,
      },
    };
  }

  async load(progressCallback) {
    progressCallback?.(10, 'Preparing Melange runtime');
    const metadata = await MelangeNavigation.prepare({
      tokenKey: this.options.tokenKey || '',
      llmModelName: this.runtimeConfig.llmModelName,
      llmFallbackModelName: this.runtimeConfig.llmFallbackModelName,
      llmVersion: this.options.llmVersion || MODELS.version || 1,
      speechModelName: this.runtimeConfig.speechModelName,
      speechEncoderModelName: this.runtimeConfig.speechEncoderModelName,
      ttsModelName: this.runtimeConfig.ttsModelName,
      speechVersion: this.options.speechVersion || 1,
      locale: this.runtimeConfig.locale,
      deviceClass: this.runtimeConfig.deviceClass,
      maxGeneratedTokens: this.runtimeConfig.maxGeneratedTokens,
      inferenceTimeoutMs: this.runtimeConfig.inferenceTimeoutMs,
      voiceCommandLatencyTargetMs: this.runtimeConfig.voiceCommandLatencyTargetMs,
      domain: 'automobile',
    });
    this.metadata = {
      ...this.metadata,
      ...(metadata || {}),
    };
    progressCallback?.(100, 'Melange ready');
  }

  getLabel() {
    return this.metadata.supportsNativeMelange ? 'Melange' : 'Melange bridge';
  }

  getStatus() {
    return this.metadata;
  }

  supportsVoiceCommands() {
    return Boolean(this.metadata.supportsVoiceCommands);
  }

  async parseRoutingQuery(query) {
    const result = await MelangeNavigation.parseRouteIntent({
      query,
      locale: this.options.locale || 'en-US',
      vehicleProfile: 'automobile',
    });
    return normalizeRoutingResult(result, this.options.locale);
  }

  async chat(userMessage, history = []) {
    const result = await MelangeNavigation.chatNavigation({
      message: userMessage,
      history,
      locale: this.options.locale || 'en-US',
      vehicleProfile: 'automobile',
    });
    return result?.text || result?.message || '';
  }

  async transcribeNavigationCommand(audioBase64 = '') {
    const result = await MelangeNavigation.transcribeNavigationCommand({
      locale: this.runtimeConfig.locale,
      audioBase64,
    });
    return result?.text || '';
  }

  async rankPoiCandidates(query, candidates = [], limit = 5) {
    const result = await MelangeNavigation.rankPoiCandidates({
      query,
      candidatesJson: JSON.stringify(candidates),
      limit,
      locale: this.runtimeConfig.locale,
    });
    const items = Array.isArray(result?.items)
      ? result.items
      : semanticRankCandidates(query, candidates, limit);
    return {
      items,
      runtime: result?.runtime || 'native-fallback',
    };
  }

  async predictOfflineCache(context = {}) {
    const result = await MelangeNavigation.predictOfflineCache({
      contextJson: JSON.stringify(context),
      locale: this.runtimeConfig.locale,
    });
    return {
      ...buildPredictiveCachePlan(context),
      ...(result || {}),
    };
  }
}

export class AIAssistant {
  constructor(options = {}) {
    this.options = options;
    this.provider = new RuleBasedNavigationProvider(options);
    this.ready = false;
    this.loading = false;
    this.progressCallbacks = [];
  }

  onProgress(callback) {
    this.progressCallbacks.push(callback);
  }

  isReady() {
    return this.ready;
  }

  isLoading() {
    return this.loading;
  }

  getProviderLabel() {
    return this.provider?.getLabel?.() || 'Unknown';
  }

  getProviderStatus() {
    return this.provider?.getStatus?.() || null;
  }

  supportsVoiceCommands() {
    if (typeof this.provider?.supportsVoiceCommands === 'function') {
      return this.provider.supportsVoiceCommands();
    }
    return typeof this.provider?.transcribeNavigationCommand === 'function';
  }

  getRuntimeConfig() {
    return buildMelangeRuntimeConfig(this.options);
  }

  async load() {
    if (this.ready || this.loading) return;
    this.loading = true;

    const attempts = [
      new NativeMelangeProvider(this.options),
      new RuleBasedNavigationProvider(this.options),
    ];

    let lastError = null;

    for (const candidate of attempts) {
      try {
        await candidate.load((percent, message) => this.#emitProgress(percent, message));
        this.provider = candidate;
        this.ready = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    this.loading = false;

    if (!this.ready) {
      throw lastError || new Error('No AI provider available');
    }
  }

  async parseRoutingQuery(query) {
    if (!this.ready) {
      return normalizeRoutingResult(
        await new RuleBasedNavigationProvider(this.options).parseRoutingQuery(query),
        this.options.locale,
      );
    }

    try {
      return normalizeRoutingResult(
        await this.provider.parseRoutingQuery(query),
        this.options.locale,
      );
    } catch {
      return normalizeRoutingResult(
        await new RuleBasedNavigationProvider(this.options).parseRoutingQuery(query),
        this.options.locale,
      );
    }
  }

  async chat(userMessage, history = []) {
    if (!this.ready) {
      return new RuleBasedNavigationProvider(this.options).chat(userMessage, history);
    }

    try {
      return (
        await this.provider.chat(userMessage, history)
      ) || new RuleBasedNavigationProvider(this.options).chat(userMessage, history);
    } catch {
      return new RuleBasedNavigationProvider(this.options).chat(userMessage, history);
    }
  }

  async transcribeNavigationCommand(audioBase64 = '') {
    if (!this.supportsVoiceCommands()) {
      throw new Error('Voice transcription is unavailable on the current provider');
    }

    return this.provider.transcribeNavigationCommand(audioBase64);
  }

  async rankPoiCandidates(query, candidates = [], limit = 5) {
    if (typeof this.provider?.rankPoiCandidates !== 'function') {
      return semanticRankCandidates(query, candidates, limit);
    }

    try {
      const result = await this.provider.rankPoiCandidates(query, candidates, limit);
      return Array.isArray(result?.items) ? result.items : result;
    } catch {
      return semanticRankCandidates(query, candidates, limit);
    }
  }

  async predictOfflineCache(context = {}) {
    if (typeof this.provider?.predictOfflineCache !== 'function') {
      return buildPredictiveCachePlan(context);
    }

    try {
      return await this.provider.predictOfflineCache(context);
    } catch {
      return buildPredictiveCachePlan(context);
    }
  }

  #emitProgress(percent, message) {
    this.progressCallbacks.forEach((callback) => callback(percent, message));
  }
}
