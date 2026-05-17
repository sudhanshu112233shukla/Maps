import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

async function run() {
  const models = JSON.parse(await readFile('./src/ai/models.json', 'utf8'));
  const aiAssistant = await readFile('./src/ai/AIAssistant.js', 'utf8');
  const registry = await readFile('./src/ai/MelangeModelRegistry.js', 'utf8');

  assert(models?.llm?.primary?.id, 'missing llm.primary.id');
  assert(models?.llm?.fallback?.id, 'missing llm.fallback.id');
  assert(models?.speech?.asr?.id, 'missing speech.asr.id');
  assert(models?.speech?.asr?.encoder, 'missing speech.asr.encoder');
  assert(models?.speech?.tts?.id, 'missing speech.tts.id');
  assert(Number.isInteger(models?.limits?.maxGeneratedTokens), 'missing limits.maxGeneratedTokens');
  assert(aiAssistant.includes('llmFallbackModelName'), 'AIAssistant does not pass llmFallbackModelName');
  assert(aiAssistant.includes('speechEncoderModelName'), 'AIAssistant does not pass speechEncoderModelName');
  assert(aiAssistant.includes('predictOfflineCache'), 'AIAssistant predictive cache API missing');
  assert(registry.includes('buildMelangeRuntimeConfig'), 'MelangeModelRegistry missing runtime config builder');
}

run()
  .then(() => {
    process.stdout.write('[ok] models config selfcheck: model registry and native prepare wiring verified\n');
  })
  .catch((error) => {
    process.stderr.write(`[fail] models config selfcheck: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
