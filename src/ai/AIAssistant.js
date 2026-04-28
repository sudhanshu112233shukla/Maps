/**
 * AIAssistant.js — On-device AI using Transformers.js (Xenova)
 * Model: Phi-3 Mini 3.8B (Q4 quantized) — runs fully on-device
 * Parses natural language queries into routing parameters
 */

const MODEL_ID = 'Xenova/Phi-3-mini-4k-instruct';
const FALLBACK_MODEL_ID = 'Xenova/distilgpt2'; // tiny fallback for testing

export class AIAssistant {
  constructor() {
    this.pipeline = null;
    this.tokenizer = null;
    this.model = null;
    this.ready = false;
    this.loading = false;
    this.progressCallbacks = [];
  }

  onProgress(cb) { this.progressCallbacks.push(cb); }

  _emitProgress(pct, text) {
    this.progressCallbacks.forEach(cb => cb(pct, text));
  }

  async load(useFallback = false) {
    if (this.ready || this.loading) return;
    this.loading = true;

    try {
      const { pipeline, env } = await import('@xenova/transformers');

      // Allow local model caching via OPFS (Origin Private File System)
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      this._emitProgress(5, 'Initializing AI engine…');

      const modelId = useFallback ? FALLBACK_MODEL_ID : MODEL_ID;

      this.pipeline = await pipeline('text-generation', modelId, {
        quantized: true,
        progress_callback: (prog) => {
          if (prog.status === 'downloading') {
            const pct = Math.round((prog.loaded / prog.total) * 100);
            this._emitProgress(pct, `Downloading AI model… ${pct}%`);
          } else if (prog.status === 'loading') {
            this._emitProgress(95, 'Loading model into memory…');
          }
        }
      });

      this._emitProgress(100, 'AI ready!');
      this.ready = true;
      this.loading = false;
      console.log('[AI] Model loaded:', modelId);
    } catch (err) {
      console.error('[AI] Failed to load model:', err);
      this.loading = false;
      throw err;
    }
  }

  /**
   * Parse a natural language routing query into structured params
   * Returns: { destination, avoidTolls, mode, poi }
   */
  async parseRoutingQuery(query) {
    if (!this.ready) {
      return this._ruleBasedParse(query);
    }

    const systemPrompt = `You are a navigation assistant. Parse the user's routing request into JSON with fields:
- destination: string (place name or null)
- mode: "fastest" | "eco" | "no-toll"
- poi: string (point of interest type like "hospital", "petrol station", "restaurant" or null)
- language: detected language code

Return ONLY valid JSON, no explanation.`;

    const prompt = `${systemPrompt}\n\nUser: "${query}"\nJSON:`;

    try {
      const result = await this.pipeline(prompt, {
        max_new_tokens: 150,
        temperature: 0.1,
        do_sample: false,
      });

      const text = result[0].generated_text.split('JSON:')[1]?.trim() || '{}';
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}') + 1;
      return JSON.parse(text.slice(jsonStart, jsonEnd));
    } catch (e) {
      return this._ruleBasedParse(query);
    }
  }

  /**
   * Generate a conversational response for general queries
   */
  async chat(userMessage, history = []) {
    if (!this.ready) {
      return this._ruleBasedChat(userMessage);
    }

    const contextMessages = history.slice(-4).map(m =>
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n');

    const prompt = `You are an offline navigation AI assistant. Answer briefly and helpfully about routes, POIs, and navigation. 
${contextMessages}
User: ${userMessage}
Assistant:`;

    try {
      const result = await this.pipeline(prompt, {
        max_new_tokens: 200,
        temperature: 0.7,
        do_sample: true,
        repetition_penalty: 1.1
      });
      const text = result[0].generated_text;
      return text.split('Assistant:').pop().trim();
    } catch (e) {
      return this._ruleBasedChat(userMessage);
    }
  }

  /** Rule-based fallback when model isn't loaded */
  _ruleBasedParse(query) {
    const q = query.toLowerCase();
    const result = { destination: null, mode: 'fastest', poi: null, language: 'en' };

    const poiKeywords = {
      hospital: ['hospital', 'emergency', 'clinic', 'doctor', 'अस्पताल'],
      petrol: ['petrol', 'gas', 'fuel', 'station', 'petrol station', 'ईंधन'],
      restaurant: ['restaurant', 'food', 'eat', 'cafe', 'खाना'],
      atm: ['atm', 'cash', 'bank'],
      hotel: ['hotel', 'stay', 'lodge', 'accommodation'],
      pharmacy: ['pharmacy', 'medicine', 'drug store', 'chemist']
    };

    for (const [poi, keywords] of Object.entries(poiKeywords)) {
      if (keywords.some(k => q.includes(k))) { result.poi = poi; break; }
    }

    if (q.includes('avoid toll') || q.includes('no toll') || q.includes('without toll')) {
      result.mode = 'no-toll';
    } else if (q.includes('eco') || q.includes('fuel efficient') || q.includes('save fuel')) {
      result.mode = 'eco';
    }

    // Extract destination after "to", "navigate to", "take me to" etc.
    const destMatch = q.match(/(?:to|navigate to|take me to|directions? to|find)\s+(.+?)(?:\s+(?:from|via|avoid|and|,|$))/i);
    if (destMatch) result.destination = destMatch[1].trim();

    return result;
  }

  _ruleBasedChat(query) {
    const q = query.toLowerCase();
    if (q.includes('hello') || q.includes('hi')) return "Hello! I'm your offline navigation assistant. Ask me for directions, nearby places, or route suggestions!";
    if (q.includes('hospital') || q.includes('emergency')) return "I'll find the nearest hospital on your current map region. Tap the search bar and type 'hospital' to see POIs.";
    if (q.includes('route') || q.includes('navigate')) return "To start navigation, enter your destination in the search bar above. I support fastest, eco, and toll-free routes!";
    if (q.includes('offline')) return "Yes! This app works fully offline once map data is downloaded. No internet needed for navigation.";
    return "I'm your on-device navigation AI. I can help with routes, finding places, and navigation tips — all offline!";
  }

  isReady() { return this.ready; }
  isLoading() { return this.loading; }
}
