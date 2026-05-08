import { MelangeNavigation } from './MelangeNavigation.js';

const MELANGE_LLM_MODEL = 'Qwen/Qwen3-4B';
const MELANGE_SPEECH_MODEL = 'OpenAI/whisper-tiny-decoder';
const BROWSER_FALLBACK_MODEL = 'Xenova/distilgpt2';

const KNOWN_MODES = new Set(['fastest', 'safest', 'eco', 'no-toll']);
const POI_ALIASES = {
  hospital: ['hospital', 'clinic', 'doctor', 'emergency'],
  fuel: ['fuel', 'gas', 'gas station', 'petrol', 'petrol pump'],
  charging: ['charging', 'charger', 'ev', 'ev charger'],
  restaurant: ['restaurant', 'food', 'eat', 'cafe', 'coffee'],
  hotel: ['hotel', 'stay', 'motel', 'lodge'],
  pharmacy: ['pharmacy', 'medicine', 'chemist'],
  atm: ['atm', 'cash', 'bank'],
  rest_area: ['rest area', 'toilet', 'washroom', 'service area'],
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

  async parseRoutingQuery(query) {
    const lowered = query.toLowerCase();
    const mode = lowered.includes('no toll') || lowered.includes('avoid toll')
      ? 'no-toll'
      : lowered.includes('eco') || lowered.includes('fuel efficient')
        ? 'eco'
        : lowered.includes('safe') || lowered.includes('safer')
          ? 'safest'
          : 'fastest';

    const destinationMatch = lowered.match(
      /(?:to|navigate to|take me to|directions to|route to|drive to)\s+(.+?)(?:\s+(?:avoiding|avoid|with|via|and)|$)/i,
    );

    const avoid = [];
    if (lowered.includes('avoid toll')) avoid.push('tolls');
    if (lowered.includes('avoid highway')) avoid.push('highways');
    if (lowered.includes('avoid traffic')) avoid.push('traffic');
    if (lowered.includes('avoid night')) avoid.push('night-driving');

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
}

class NativeMelangeProvider {
  constructor(options = {}) {
    this.options = options;
    this.kind = 'melange';
  }

  async load(progressCallback) {
    progressCallback?.(10, 'Preparing Melange runtime');
    await MelangeNavigation.prepare({
      tokenKey: this.options.tokenKey || '',
      llmModelName: this.options.llmModelName || MELANGE_LLM_MODEL,
      llmVersion: this.options.llmVersion || 1,
      speechModelName: this.options.speechModelName || MELANGE_SPEECH_MODEL,
      speechVersion: this.options.speechVersion || 1,
      locale: this.options.locale || 'en-US',
      domain: 'automobile',
    });
    progressCallback?.(100, 'Melange ready');
  }

  getLabel() {
    return 'Melange';
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

  async transcribeNavigationCommand() {
    const result = await MelangeNavigation.transcribeNavigationCommand({
      locale: this.options.locale || 'en-US',
    });
    return result?.text || '';
  }
}

class BrowserTransformersProvider {
  constructor(options = {}) {
    this.options = options;
    this.kind = 'browser';
    this.pipeline = null;
  }

  async load(progressCallback) {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    progressCallback?.(15, 'Loading browser fallback model');

    this.pipeline = await pipeline('text-generation', BROWSER_FALLBACK_MODEL, {
      quantized: true,
      progress_callback: (progress) => {
        if (progress.status === 'downloading' && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          progressCallback?.(percent, `Downloading browser fallback ${percent}%`);
        }
      },
    });

    progressCallback?.(100, 'Browser fallback ready');
  }

  getLabel() {
    return 'Browser fallback';
  }

  async parseRoutingQuery(query) {
    const prompt = [
      'You are a navigation assistant for an automobile-focused offline map app.',
      'Return JSON only with keys: destination, mode, poi, language, avoid.',
      'Mode must be one of fastest, safest, eco, no-toll.',
      `User: ${query}`,
      'JSON:',
    ].join('\n');

    const result = await this.pipeline(prompt, {
      max_new_tokens: 100,
      temperature: 0.1,
      do_sample: false,
    });

    const text = result?.[0]?.generated_text || '{}';
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd));
    return normalizeRoutingResult(parsed, this.options.locale);
  }

  async chat(userMessage) {
    const prompt = [
      'You are a concise automotive navigation copilot.',
      `User: ${userMessage}`,
      'Assistant:',
    ].join('\n');

    const result = await this.pipeline(prompt, {
      max_new_tokens: 120,
      temperature: 0.5,
      do_sample: true,
    });

    const output = result?.[0]?.generated_text || '';
    return output.split('Assistant:').pop().trim();
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

  supportsVoiceCommands() {
    return typeof this.provider?.transcribeNavigationCommand === 'function';
  }

  async load({ enableBrowserFallback = false } = {}) {
    if (this.ready || this.loading) return;
    this.loading = true;

    const attempts = [
      new NativeMelangeProvider(this.options),
      ...(enableBrowserFallback ? [new BrowserTransformersProvider(this.options)] : []),
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

  async transcribeNavigationCommand() {
    if (!this.supportsVoiceCommands()) {
      throw new Error('Voice transcription is unavailable on the current provider');
    }

    return this.provider.transcribeNavigationCommand();
  }

  #emitProgress(percent, message) {
    this.progressCallbacks.forEach((callback) => callback(percent, message));
  }
}
