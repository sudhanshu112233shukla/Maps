import { readFile } from 'node:fs/promises';

function assertContains(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`Missing ${label}`);
  }
}

async function main() {
  const mainJs = await readFile('./src/main.js', 'utf8');
  const aiAssistant = await readFile('./src/ai/AIAssistant.js', 'utf8');
  const recorder = await readFile('./src/ai/audio/captureNavigationAudio.js', 'utf8');
  const androidPlugin = await readFile(
    './android/app/src/main/java/com/aimapsystem/app/MelangeNavigationPlugin.java',
    'utf8',
  );

  assertContains(mainJs, 'captureNavigationAudio', 'voice capture import');
  assertContains(mainJs, 'ai.transcribeNavigationCommand(audioBase64)', 'native transcription call with audio');
  assertContains(aiAssistant, 'transcribeNavigationCommand(audioBase64 = \'\')', 'AI assistant audio parameter');
  assertContains(recorder, 'audio/wav', 'wav encoding');
  assertContains(androidPlugin, 'supportsVoiceCommands', 'Android voice capability response');
  assertContains(androidPlugin, 'audioBase64 is required', 'Android audio input guard');

  process.stdout.write('[ok] voice pipeline selfcheck: capture, bridge, and plugin audio path are wired\n');
}

main().catch((error) => {
  process.stderr.write(`[fail] voice pipeline selfcheck: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
