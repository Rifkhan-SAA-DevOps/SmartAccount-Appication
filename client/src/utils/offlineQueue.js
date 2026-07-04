const POS_QUEUE_KEY = 'smartledger_offline_pos_queue';
const POS_CACHE_KEY = 'smartledger_pos_cache_v1';

export function createClientSaleId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readOfflinePosQueue() {
  try {
    const data = JSON.parse(localStorage.getItem(POS_QUEUE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveOfflinePosQueue(queue) {
  localStorage.setItem(POS_QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('smartledger:offline-pos-queue-changed'));
}

export function queueOfflinePosSale(sale) {
  const queue = readOfflinePosQueue();
  const exists = queue.some((item) => item.clientSaleId === sale.clientSaleId);
  const next = exists ? queue : [{ ...sale, status: 'PENDING', queuedAt: new Date().toISOString(), attempts: 0 }, ...queue];
  saveOfflinePosQueue(next.slice(0, 200));
  return next;
}

export function removeOfflinePosSale(clientSaleId) {
  const next = readOfflinePosQueue().filter((item) => item.clientSaleId !== clientSaleId);
  saveOfflinePosQueue(next);
  return next;
}

export function updateOfflinePosSale(clientSaleId, patch) {
  const next = readOfflinePosQueue().map((item) => item.clientSaleId === clientSaleId ? { ...item, ...patch } : item);
  saveOfflinePosQueue(next);
  return next;
}

export function readPosCache() {
  try {
    const data = JSON.parse(localStorage.getItem(POS_CACHE_KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function savePosCache(cache) {
  localStorage.setItem(POS_CACHE_KEY, JSON.stringify({ ...cache, cachedAt: new Date().toISOString() }));
}

export function hasNetworkError(error) {
  return !error?.response || error.code === 'ERR_NETWORK' || String(error.message || '').toLowerCase().includes('network');
}
