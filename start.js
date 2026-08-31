// Starts both backend and frontend in a single process
const { spawn } = require('child_process');

function run(cmd, args, opts) {
  const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  proc.on('error', (err) => console.error(`[${opts.label}] error:`, err.message));
  proc.on('exit', (code) => {
    if (code !== 0) console.error(`[${opts.label}] exited with code ${code}`);
  });
  return proc;
}

console.log('Starting One Click School Solutions backend on port 3001...');
run('npm', ['run', 'dev'], { cwd: __dirname + '/backend', env: { ...process.env, PORT: '3001' }, label: 'backend' });

// Give the backend a moment to start before launching the frontend
setTimeout(() => {
  console.log('Starting One Click School Solutions frontend on port 5000...');
  run('npm', ['start'], { cwd: __dirname + '/frontend', env: { ...process.env, PORT: '5000' }, label: 'frontend' });
}, 2000);
