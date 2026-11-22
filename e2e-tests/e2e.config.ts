import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

// The app under test runs on 3100 (the local backend on 8100 allows exactly this origin). Start the stack first: node scripts/local-stack.mjs up
const PORT = process.env.E2E_PORT ?? '3100';
const APP = `http://localhost:${PORT}`;
const app = {
  url: APP,
  command: {
    executable: 'node',
    args: ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', PORT],
    cwd: '..',
    env: { API_URL: process.env.E2E_API ?? 'http://localhost:8100' },
    log: '.e2e/logs/app.log',
    startupTimeout: 180_000,
    reuseExisting: true,
  },
};

export default {
  tests: ['tests/**/*.e2e.ts'],
  output: '.shots', // screenshots and traces land here (git-ignored)
  timeout: 120_000,
  workers: 6, // owner's rule: 6 in parallel. Tests that change a shared account (password, sign-in attempts) must make their own user
  targets: [
    { name: 'desktop', engine: web({ viewport: { width: 1440, height: 900 } }), app },
    { name: 'phone', engine: web({ viewport: { width: 390, height: 844 } }), app },
    { name: 'logic', platform: 'node' },
  ],
} satisfies E2EConfig;
