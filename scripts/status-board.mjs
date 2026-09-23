#!/usr/bin/env node
// Read-only: prints the canonical project-status.v1 board for a registry.
import { parseArgs } from 'node:util';
import { loadProjectStatusBoard } from '../src/project-status.mjs';

let registryPath;
let projectId;
try {
  const { values, positionals } = parseArgs({ options: { 'project-id': { type: 'string' } }, allowPositionals: true });
  if (positionals.length !== 1 || values['project-id']?.trim() === '') throw new Error('usage');
  [registryPath] = positionals;
  projectId = values['project-id'];
} catch {
  process.stderr.write('Usage: status-board.mjs <registry.json> [--project-id <id>]\n');
  process.exit(2);
}

try {
  process.stdout.write(`${JSON.stringify(await loadProjectStatusBoard(registryPath, { projectId }), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
