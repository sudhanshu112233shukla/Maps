import { WebPlugin, registerPlugin } from '@capacitor/core';

class MelangeNavigationWeb extends WebPlugin {
  async prepare(options) {
    console.log('[Melange SDK Web Simulation] Preparing models:', options);
    return {
      prepared: true,
      runtime: 'web-sim',
      supportsNativeMelange: false,
      supportsVoiceCommands: false,
      supportsSemanticSearch: true,
      supportsPredictiveCaching: true,
      deviceClass: options.deviceClass || 'high-end',
      models: {
        llm: options.llmModelName || 'google/gemma-3-4b-it',
        llmFallback: options.llmFallbackModelName || 'LiquidAI/LFM2.5-1.2B-Instruct',
        speech: options.speechModelName || 'ZETIC-ai/whisper-base-encoder',
        speechEncoder: options.speechEncoderModelName || 'ZETIC-ai/whisper-base-encoder',
        tts: options.ttsModelName || 'neuphonic/pocket-tts',
      }
    };
  }

  async parseRouteIntent(options) {
    const query = String(options.query || '');
    const lowered = query.toLowerCase();

    const destinationMatch = lowered.match(
      /(?:to|navigate to|take me to|directions to|route to|drive to)\s+(.+?)(?:\s+(?:avoiding|avoid|with|via|and)|$)/i
    );

    const containsAny = (text, terms) => terms.some((term) => text.includes(term));
    const hasAvoidHint = containsAny(lowered, ['avoid', 'avoiding', 'without', 'bina', 'bacho', 'bachiye', 'bacho', 'karke', 'बिना', 'बचिए', 'बचो']);

    const mode = containsAny(lowered, ['eco', 'kam fuel', 'fuel efficient', 'कम ईंधन'])
      ? 'eco'
      : containsAny(lowered, ['safe', 'safest', 'surakshit', 'सुरक्षित'])
        ? 'safest'
        : containsAny(lowered, ['no-toll mode', 'no toll mode', 'toll-free mode'])
          ? 'no-toll'
          : 'fastest';

    const avoid = [];
    if (containsAny(lowered, ['toll', 'tolls', 'टोल']) && hasAvoidHint) avoid.push('tolls');
    if (containsAny(lowered, ['highway', 'highways', 'हाईवे']) && hasAvoidHint) avoid.push('highways');
    if (containsAny(lowered, ['traffic', 'jam', 'ट्रैफिक']) && hasAvoidHint) avoid.push('traffic');

    const detectPoi = () => {
      if (containsAny(lowered, ['charging', 'charger', 'ev charger', 'ev', 'चार्जर', 'चार्जिंग'])) return 'charging';
      if (containsAny(lowered, ['hospital', 'clinic', 'aspatal', 'अस्पताल'])) return 'hospital';
      if (containsAny(lowered, ['gas station', 'fuel', 'petrol', 'petrol pump', 'diesel', 'पेट्रोल'])) return 'fuel';
      if (containsAny(lowered, ['restaurant', 'cafe', 'coffee', 'food', 'रेस्टोरेंट'])) return 'restaurant';
      return null;
    };

    return {
      destination: destinationMatch ? destinationMatch[1].trim() : null,
      mode,
      poi: detectPoi(),
      avoid,
      language: (options.locale || 'en-US').split('-')[0],
    };
  }

  async chatNavigation(options) {
    const msg = String(options.message || '').toLowerCase();
    if (msg.includes('fuel') || msg.includes('petrol') || msg.includes('gas')) {
      return { text: 'I can route to nearby fuel stops and prioritize major roads.' };
    }
    if (msg.includes('safe') || msg.includes('night')) {
      return { text: 'Safest mode prioritizes major roads and reduces exposure to minor roads at night.' };
    }
    if (msg.includes('offline')) {
      return { text: 'Navigation, search, and routing continue to work in offline mode.' };
    }
    return { text: 'Tell me destination, nearby stop type, and route preference (fastest, safest, eco).' };
  }

  async transcribeNavigationCommand(options) {
    return { text: '' };
  }

  async rankPoiCandidates(options) {
    const candidates = JSON.parse(options.candidatesJson || '[]');
    return {
      items: candidates.slice(0, options.limit || 5),
      runtime: 'NPU Tensor Core V3'
    };
  }

  async predictOfflineCache(options) {
    const context = JSON.parse(options.contextJson || '{}');
    return {
      regionId: context.regionId || 'india',
      radiusKm: 30,
      poiCategories: ['fuel', 'charging'],
      warmRouteModes: ['fastest']
    };
  }

  async getTelemetry() {
    return {
      sdkVersion: '3.14.0-web-sim',
      batteryLevel: 94,
      thermalStatus: 'nominal',
      npuAccelerated: true,
      inferenceLatencyMs: 42,
    };
  }
}

const MelangeNavigation = registerPlugin('MelangeNavigation', {
  web: () => new MelangeNavigationWeb(),
});

export { MelangeNavigation };
