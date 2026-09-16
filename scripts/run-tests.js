/**
 * Runs the test suite and insists that it actually ran.
 *
 * `node --test` exits 0 when it discovers no test files at all, so a renamed or
 * misplaced tests folder would turn CI green while shipping nothing tested.
 * This wrapper reads the summary and fails when the suite is empty.
 */

const { spawn } = require('node:child_process');

const child = spawn(process.execPath, ['--test'], {
  cwd: require('node:path').join(__dirname, '..'),
  stdio: ['inherit', 'pipe', 'inherit']
});

let output = '';

child.stdout.on('data', (chunk) => {
  output += chunk;
  process.stdout.write(chunk); // keep the normal report visible in the log
});

child.on('error', (err) => {
  console.error(`\nCould not start the test runner: ${err.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  const read = (label) => {
    const match = output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  };

  const total = read('tests');
  const failed = read('fail');

  if (total === null) {
    console.error('\nCould not read a test summary from the runner output.');
    process.exit(1);
  }

  if (total === 0) {
    console.error('\nNo tests were found. Expected test files under tests/.');
    console.error('If they moved, update the discovery or this check will keep failing.');
    process.exit(1);
  }

  if (code !== 0 || failed > 0) {
    console.error(`\n${failed} of ${total} tests failed.`);
    process.exit(code === 0 ? 1 : code);
  }

  console.log(`\nAll ${total} tests passed.`);
});
