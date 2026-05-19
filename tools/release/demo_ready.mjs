import { execSync } from 'node:child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function main() {
  run('npm run release:freeze');
  run('npm run selfcheck:all');

  process.stdout.write('\nDemo artifacts:\n');
  process.stdout.write('- public/data/releases/rc.lock.json\n');
  process.stdout.write('- public/data/releases/catalog.json\n');
  process.stdout.write('- public/data/releases/readiness.json\n');
  process.stdout.write('\n[ok] demo ready: freeze + selfchecks complete\n');
}

try {
  main();
} catch {
  process.exitCode = 1;
}

