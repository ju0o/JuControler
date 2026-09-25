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
  process.stderr.write(!board.length
    ? '목록에 프로젝트가 없어요 — registry.json의 projects에 항목을 넣으세요 (README 처음 쓰는 법 예시 참고)\n'
    : unknown.length
    ? `프로젝트 ${board.length}개 중 ${unknown.length}개는 상태를 알 수 없어요: ${unknown.join(', ')} — README 처음 쓰는 법의 reason 표를 보세요\n`
    : `프로젝트 ${board.length}개 모두 상태를 읽었어요\n`);
} catch (error) {
  process.stderr.write(`${korean(error)}\n${error.message}\n`);
  process.exit(1);
}

function korean({ message, cause }) {
  if (cause instanceof SyntaxError) return '프로젝트 목록 파일이 올바른 JSON이 아니에요 — 쉼표·따옴표·괄호를 확인하세요';
  if (message.startsWith('Unable to read project registry')) return '프로젝트 목록 파일을 열 수 없어요 — 경로를 확인하세요';
  if (message.startsWith('Unknown projectId')) return '그런 프로젝트 ID가 목록에 없어요 — --project-id 값을 확인하세요';
  if (message.startsWith('Invalid project registry')) return `프로젝트 목록 파일 내용이 올바르지 않아요 — ${registryHint(message)}`;
  return '상태판을 불러오지 못했어요 — 아래 내용을 확인하세요';
}

function registryHint(message) {
  const detail = message.replace('Invalid project registry: ', '');
  if (detail === 'projects must be an array') return 'projects는 [ ]로 감싼 목록이어야 해요';
  let m = detail.match(/^projectId (.+) is duplicated$/);
  if (m) return `프로젝트 ID ${m[1]}가 두 번 이상 나와요 — 하나만 남기거나 ID를 바꾸세요`;
  m = detail.match(/^projects\[(\d+)\](?:\.(\w+))? (.+)$/);
  if (!m) {
    m = detail.match(/^(.+) is not a known field$/);
    return m ? `맨 위에는 projects만 둘 수 있어요 — ${m[1]}를 지우세요` : '아래 내용을 보고 파일을 고치세요';
  }
  const [, index, field, rule] = m;
  const at = `${Number(index) + 1}번째 항목`;
  if (rule === 'must be an object') return `${at}이 { }로 감싼 객체가 아니에요`;
  if (rule === 'is not a known field') return `${at}의 ${field}는 쓸 수 없는 이름이에요 — 지우거나 철자를 확인하세요`;
  if (rule === 'must be a non-empty string') return `${at}에 ${field}가 없거나 비어 있어요 — 값을 채우세요`;
  if (rule === 'must be absolute') return `${at}의 ${field}는 /로 시작하는 절대 경로여야 해요`;
  if (rule === 'must be a nonnegative number') return `${at}의 ${field}는 0 이상의 숫자여야 해요`;
  if (rule.startsWith('must be one of ')) return `${at}의 ${field}는 ${rule.slice('must be one of '.length)} 중 하나여야 해요`;
  return `${at}을 확인하세요 — 아래 내용을 보고 파일을 고치세요`;
}
