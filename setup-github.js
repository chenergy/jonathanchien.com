#!/usr/bin/env node
/* =========================================================================
 * setup-github.js — one-time setup for deploying this site to GitHub Pages.
 *
 * Creates .github/workflows/deploy.yml, then prints the git commands to run.
 * Node only, no dependencies, safe to re-run.
 *
 *     node setup-github.js
 * ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OWNER = 'chenergy';
const REPO = 'jonathanchien.com';

const ROOT = __dirname;
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');
const WORKFLOW_PATH = path.join(WORKFLOW_DIR, 'deploy.yml');

// Built from an array rather than a template literal on purpose: the workflow
// contains ${{ ... }}, which a template literal would try to interpolate.
const WORKFLOW = [
  'name: Build and deploy to GitHub Pages',
  '',
  'on:',
  '  push:',
  '    branches: [main]',
  '  workflow_dispatch: {}',
  '',
  '# Least privilege: read the repo, publish to Pages.',
  'permissions:',
  '  contents: read',
  '  pages: write',
  '  id-token: write',
  '',
  '# One deploy at a time. Queue rather than cancel so a push mid-deploy',
  '# still ships instead of being dropped.',
  'concurrency:',
  '  group: pages',
  '  cancel-in-progress: false',
  '',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Check out',
  '        uses: actions/checkout@v4',
  '',
  '      - name: Set up Node',
  '        uses: actions/setup-node@v4',
  '        with:',
  "          node-version: '20'",
  '',
  '      # No `npm install` — the site has zero dependencies on purpose.',
  '      - name: Build',
  '        run: node build.js',
  '',
  '      - name: Fail if the build produced nothing',
  '        run: test -f dist/index.html',
  '',
  '      - name: Configure Pages',
  '        uses: actions/configure-pages@v5',
  '',
  '      - name: Upload artifact',
  '        uses: actions/upload-pages-artifact@v3',
  '        with:',
  '          path: dist',
  '',
  '  deploy:',
  '    needs: build',
  '    runs-on: ubuntu-latest',
  '    environment:',
  '      name: github-pages',
  '      url: ${{ steps.deployment.outputs.page_url }}',
  '    steps:',
  '      - name: Deploy',
  '        id: deployment',
  '        uses: actions/deploy-pages@v4',
  '',
].join('\n');

/** Returns the trimmed output of a command, or null if it fails / is missing. */
function tryExec(command) {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (err) {
    return null;
  }
}

function main() {
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true });

  const existed = fs.existsSync(WORKFLOW_PATH);
  fs.writeFileSync(WORKFLOW_PATH, WORKFLOW);
  console.log(
    `${existed ? 'Updated' : 'Created'} .github${path.sep}workflows${path.sep}deploy.yml`
  );

  const isRepo = fs.existsSync(path.join(ROOT, '.git'));

  const gitVersion = tryExec('git --version');
  if (!gitVersion) {
    console.log(`
Git is not installed (or not on PATH yet). Install it with:

  winget install Git.Git

Then CLOSE AND REOPEN your terminal and run this script again.
`);
    return;
  }
  console.log(`Found ${gitVersion}`);

  // `git commit` fails outright if identity is unset. Catch it here rather
  // than letting it blow up four commands from now.
  const identity = tryExec('git config --get user.email');

  console.log(`
Next, run these in this folder. Git opens a browser window to sign in —
you do not need an access token.
`);

  const steps = [];
  if (!isRepo) steps.push('git init -b main');
  if (!identity) {
    steps.push(
      'git config --global user.name "JJ"',
      'git config --global user.email "jamesjlee88@gmail.com"'
    );
  }
  steps.push(
    'git add -A',
    'git commit -m "Initial commit: personal site scaffold"',
    `git remote add origin https://github.com/${OWNER}/${REPO}.git`,
    'git push -u origin main'
  );
  steps.forEach((s) => console.log('  ' + s));

  if (!identity) {
    console.log(`
(Git has no name/email configured on this machine yet, so the two
 config lines above are included — commit fails without them.)`);
  }

  console.log(`
Then on github.com:
  Settings -> Pages -> Source: GitHub Actions

The Actions tab shows the build. About a minute later the site is live at:
  https://${OWNER}.github.io/${REPO}/
`);

  if (isRepo) {
    console.log('(This folder is already a git repo, so "git init" is skipped.)\n');
  }
}

main();
