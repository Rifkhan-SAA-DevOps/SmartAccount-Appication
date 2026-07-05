const SNAPSHOT_KEY = 'smartledger_rep_offline_snapshot_v1';
const QUEUE_KEY = 'smartledger_rep_offline_queue_v1';
const SETTINGS_KEY = 'smartledger_rep_offline_settings_v1';

export function makeDraftId(prefix = 'draft') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getOfflineSnapshot() {
  return readJson(SNAPSHOT_KEY, null);
}

export function saveOfflineSnapshot(snapshot) {
  const payload = {
    ...snapshot,
    cachedAt: new Date().toISOString()
  };
  writeJson(SNAPSHOT_KEY, payload);
  return payload;
}

export function clearOfflineSnapshot() {
  localStorage.removeItem(SNAPSHOT_KEY);
}

export function getOfflineQueue() {
  return readJson(QUEUE_KEY, []);
}

export function saveOfflineQueue(queue) {
  writeJson(QUEUE_KEY, Array.isArray(queue) ? queue : []);
}

export function addOfflineDraft(type, payload, title) {
  const draft = {
    id: makeDraftId(type),
    type,
    title: title || type,
    payload,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attempts: 0,
    error: null
  };
  const next = [draft, ...getOfflineQueue()];
  saveOfflineQueue(next);
  return draft;
}

export function updateOfflineDraft(id, patch) {
  const next = getOfflineQueue().map((item) =>
    item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
  );
  saveOfflineQueue(next);
  return next;
}

export function removeOfflineDraft(id) {
  const next = getOfflineQueue().filter((item) => item.id !== id);
  saveOfflineQueue(next);
  return next;
}

export function clearSyncedDrafts() {
  const next = getOfflineQueue().filter((item) => item.status !== 'SYNCED');
  saveOfflineQueue(next);
  return next;
}

export function clearAllOfflineDrafts() {
  saveOfflineQueue([]);
}

export function getOfflineSettings() {
  return readJson(SETTINGS_KEY, { routeId: '', employeeId: '', vanId: '', date: new Date().toISOString().slice(0, 10) });
}

export function saveOfflineSettings(settings) {
  const next = { ...getOfflineSettings(), ...settings };
  writeJson(SETTINGS_KEY, next);
  return next;
}

export const draftEndpointMap = {
  visit: '/rep-mobile/visits',
  collection: '/rep-mobile/collections',
  quickSupply: '/rep-mobile/quick-supply',
  dayClosing: '/rep-mobile/day-closing'
};

export async function syncOfflineQueue(api, onProgress = () => {}) {
  const queue = getOfflineQueue();
  const results = [];

  for (const draft of queue) {
    if (draft.status === 'SYNCED') {
      results.push({ id: draft.id, status: 'SKIPPED' });
      continue;
    }

    const endpoint = draftEndpointMap[draft.type];
    if (!endpoint) {
      updateOfflineDraft(draft.id, { status: 'FAILED', error: `Unknown draft type: ${draft.type}` });
      results.push({ id: draft.id, status: 'FAILED' });
      continue;
    }

    try {
      onProgress({ draft, status: 'SYNCING' });
      updateOfflineDraft(draft.id, { status: 'SYNCING', error: null, attempts: Number(draft.attempts || 0) + 1 });
      const response = await api.post(endpoint, draft.payload);
      updateOfflineDraft(draft.id, { status: 'SYNCED', result: response.data, error: null });
      results.push({ id: draft.id, status: 'SYNCED', response: response.data });
      onProgress({ draft, status: 'SYNCED' });
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Sync failed';
      updateOfflineDraft(draft.id, { status: 'FAILED', error: message, attempts: Number(draft.attempts || 0) + 1 });
      results.push({ id: draft.id, status: 'FAILED', error: message });
      onProgress({ draft, status: 'FAILED', error: message });
      break;
    }
  }

  return results;
}
