import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadProjectRegistryEntries } from './project-registry.mjs';

const schema = 'project-status.v1';
const sourceKind = 'repository-status-file';

const timestamp = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

const fields = new Set(['schema', 'projectId', 'status', 'observedAt', 'generatedAt', 'stale', 'source', 'sourceRevision', 'reason']);
const sourceFields = new Set(['kind', 'id']);
const only = (value, allowed) => Object.keys(value).every((key) => allowed.has(key));

const text = (value) => typeof value === 'string' && value.trim() !== '';

const generatedAt = (now) => {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
};

const unknown = (projectId, now, reason, sourceRef) => ({
  schema,
  projectId: text(projectId) ? projectId : 'UNKNOWN',
  status: 'UNKNOWN',
  observedAt: generatedAt(now),
  generatedAt: generatedAt(now),
  stale: true,
  source: { kind: sourceKind, id: text(sourceRef) ? sourceRef : text(projectId) ? projectId : 'UNKNOWN' },
  reason,
});

const projection = (value, projectId, now, freshnessMs, sourceRef) => {
  const nowMs = Date.parse(generatedAt(now));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unknown(projectId, now, 'malformed', sourceRef);
  if (!only(value, fields) || value.schema !== schema || value.projectId !== projectId || !text(value.status)
    || !timestamp(value.observedAt) || !value.source || typeof value.source !== 'object'
    || Array.isArray(value.source) || !only(value.source, sourceFields) || !text(value.source.kind) || !text(value.source.id)
    || (value.generatedAt !== undefined && !timestamp(value.generatedAt))
    || (value.stale !== undefined && typeof value.stale !== 'boolean')
    || (value.sourceRevision !== undefined && !text(value.sourceRevision))
    || (value.reason !== undefined && !text(value.reason))
    || Date.parse(value.observedAt) > nowMs) {
    return unknown(projectId, now, 'invalid', sourceRef);
  }

  const generated = generatedAt(now);
  const stale = value.stale === true || nowMs - Date.parse(value.observedAt) > freshnessMs;
  const result = {
    schema,
    projectId,
    status: value.status,
    observedAt: value.observedAt,
    generatedAt: generated,
    stale,
    source: { kind: value.source.kind, id: value.source.id },
  };
  if (text(value.sourceRevision)) result.sourceRevision = value.sourceRevision;
  if (text(value.reason)) result.reason = value.reason;
  return result;
};

export async function loadProjectStatus(currentPath, projectIdOrOptions, options = {}) {
  const optionsObject = typeof projectIdOrOptions === 'object' && projectIdOrOptions !== null
    ? projectIdOrOptions : options;
  const projectId = typeof projectIdOrOptions === 'string'
    ? projectIdOrOptions : optionsObject.projectId;
  const now = optionsObject.now ?? new Date();
  const { sourceRef } = optionsObject;
  const freshnessMs = optionsObject.maxAgeMs ?? optionsObject.freshnessMs ?? 5 * 60 * 1000;
  if (!Number.isFinite(freshnessMs) || freshnessMs < 0 || !text(projectId)) {
    return unknown(projectId, now, 'invalid-request', sourceRef);
  }

  try {
    return projection(JSON.parse(await readFile(currentPath, 'utf8')), projectId, now, freshnessMs, sourceRef);
  } catch {
    return unknown(projectId, now, 'unavailable', sourceRef);
  }
}

export async function loadProjectStatusBoard(registryPath, { projectId: selected, ...options } = {}) {
  let projects = await loadProjectRegistryEntries(registryPath);
  const projectIds = new Set();
  for (const { projectId } of projects) {
    if (projectIds.has(projectId)) throw new TypeError(`Invalid project registry: projectId ${projectId} is duplicated`);
    projectIds.add(projectId);
  }
  if (selected !== undefined) {
    if (!projectIds.has(selected)) throw new TypeError(`Unknown projectId: ${selected}`);
    projects = projects.filter(({ projectId }) => projectId === selected);
  }
  return Promise.all(projects.map(({ projectId, dataRoot, sourceRef, freshnessMs }) => loadProjectStatus(
    join(dataRoot, 'current.json'),
    projectId,
    freshnessMs === undefined ? { ...options, sourceRef } : { ...options, sourceRef, maxAgeMs: freshnessMs },
  )));
}
