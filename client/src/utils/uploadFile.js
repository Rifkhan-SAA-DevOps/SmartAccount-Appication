import { api } from '../api/http.js';

export async function uploadBusinessFile(file, options = {}) {
  if (!file) throw new Error('Select a file first.');

  const payload = {
    folder: options.folder || 'documents',
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    purpose: options.purpose || 'DOCUMENT',
    entityType: options.entityType || null,
    entityId: options.entityId || null
  };

  const { data: signed } = await api.post('/files/presign', payload);

  const uploadResponse = await fetch(signed.uploadUrl, {
    method: signed.method || 'PUT',
    headers: signed.headers || { 'Content-Type': payload.contentType },
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error(`S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
  }

  const { data: document } = await api.post('/files/commit', {
    ...payload,
    folder: signed.folder || payload.folder,
    filename: signed.fileName || payload.filename,
    originalName: file.name,
    key: signed.key,
    publicUrl: signed.publicUrl
  });

  return document;
}
