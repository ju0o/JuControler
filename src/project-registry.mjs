import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const requiredFields = ['projectId', 'workspaceRoot', 'dataRoot', 'sourceRef'];
const entryFields = new Set([...requiredFields, 'freshnessMs', 'sourceKind']);
const sourceKinds = new Set(['repository-status-file', 'juplan-status']);

const invalid = (message) => {
  throw new TypeError(`Invalid project registry: ${message}`);
};

const nonEmptyString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${field} must be a non-empty string`);
};

const validateEntry = (entry, index) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid(`projects[${index}] must be an object`);
  for (const field of Object.keys(entry)) {
    if (!entryFields.has(field)) invalid(`projects[${index}].${field} is not a known field`);
  }
  for (const field of requiredFields) nonEmptyString(entry[field], `projects[${index}].${field}`);
  if (!isAbsolute(entry.workspaceRoot)) invalid(`projects[${index}].workspaceRoot must be absolute`);
  if (!isAbsolute(entry.dataRoot)) invalid(`projects[${index}].dataRoot must be absolute`);
  if (entry.freshnessMs !== undefined && !(Number.isFinite(entry.freshnessMs) && entry.freshnessMs >= 0)) {
    invalid(`projects[${index}].freshnessMs must be a nonnegative number`);
  }
  if (entry.sourceKind !== undefined && !sourceKinds.has(entry.sourceKind)) {
    invalid(`projects[${index}].sourceKind must be one of ${[...sourceKinds].join(', ')}`);
  }
  return entry;
};

export async function loadProjectRegistryEntries(registryPath) {
  let registry;
  try {
    registry = JSON.parse(await readFile(registryPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read project registry: ${error.message}`, { cause: error });
  }

  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.projects)) {
    invalid('projects must be an array');
  }
  for (const field of Object.keys(registry)) {
    if (field !== 'projects') invalid(`${field} is not a known field`);
  }

  return registry.projects.map(validateEntry);
}

export async function loadProjectRegistry(registryPath, projectId) {
  nonEmptyString(projectId, 'projectId');

  const entries = await loadProjectRegistryEntries(registryPath);
  const matches = entries.filter((entry) => entry.projectId === projectId);
  if (matches.length === 0) invalid(`projectId ${projectId} was not found`);
  if (matches.length > 1) invalid(`projectId ${projectId} is duplicated`);

  return { ...matches[0] };
}
