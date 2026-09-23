import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const requiredFields = ['projectId', 'workspaceRoot', 'dataRoot', 'sourceRef'];

const invalid = (message) => {
  throw new TypeError(`Invalid project registry: ${message}`);
};

const nonEmptyString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${field} must be a non-empty string`);
};

const validateEntry = (entry, index) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid(`projects[${index}] must be an object`);
  for (const field of requiredFields) nonEmptyString(entry[field], `projects[${index}].${field}`);
  if (!isAbsolute(entry.workspaceRoot)) invalid(`projects[${index}].workspaceRoot must be absolute`);
  if (!isAbsolute(entry.dataRoot)) invalid(`projects[${index}].dataRoot must be absolute`);
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
