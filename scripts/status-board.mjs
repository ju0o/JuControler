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
  process.stderr.write('사용법: node scripts/status-board.mjs <프로젝트 목록 파일.json> [--project-id <프로젝트 ID>]\n');
  process.stderr.write('Usage: status-board.mjs <registry.json> [--project-id <id>]\n');
  process.exit(2);
}

try {
  const board = await loadProjectStatusBoard(registryPath, { projectId });
  process.stdout.write(`${JSON.stringify(board, null, 2)}\n`);
  const unknown = board.filter((row) => row.status === 'UNKNOWN' || row.stale).map((row) => `${row.projectId}(${row.reason ?? 'stale'})`);
  process.stderr.write(unknown.length
    ? `프로젝트 ${board.length}개 중 ${unknown.length}개는 상태를 알 수 없어요: ${unknown.join(', ')} — README 처음 쓰는 법의 reason 표를 보세요\n`
    : `프로젝트 ${board.length}개 모두 상태를 읽었어요\n`);
} catch (error) {
  process.stderr.write(`${korean(error.message)}\n${error.message}\n`);
  process.exit(1);
}

function korean(message) {
  if (message.startsWith('Unable to read project registry')) return '프로젝트 목록 파일을 열 수 없어요 — 경로를 확인하세요';
  if (message.startsWith('Unknown projectId')) return '그런 프로젝트 ID가 목록에 없어요 — --project-id 값을 확인하세요';
  if (message.startsWith('Invalid project registry')) return '프로젝트 목록 파일 내용이 올바르지 않아요 — 아래 내용을 보고 파일을 고치세요';
  return '상태판을 불러오지 못했어요 — 아래 내용을 확인하세요';
}
