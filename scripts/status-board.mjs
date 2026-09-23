#!/usr/bin/env node
// Read-only: prints the canonical project-status.v1 board for a registry.
import { loadProjectStatusBoard } from '../src/project-status.mjs';

const [registryPath] = process.argv.slice(2);
if (!registryPath) {
  process.stderr.write('Usage: status-board.mjs <registry.json>\n');
  process.exit(2);
}

try {
  process.stdout.write(`${JSON.stringify(await loadProjectStatusBoard(registryPath), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
