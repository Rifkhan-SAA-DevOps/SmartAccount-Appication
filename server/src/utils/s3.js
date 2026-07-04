import crypto from 'crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
const bucket = process.env.S3_UPLOAD_BUCKET || process.env.S3_BUCKET_DOCUMENTS || '';
const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL || '';
const expiresIn = Number(process.env.S3_SIGNED_URL_EXPIRES_SECONDS || 300);

const s3 = new S3Client({ region });

const allowedFolders = new Set(['logos', 'invoices', 'expenses', 'documents', 'products', 'imports']);
const allowedMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain'
]);

export function getUploadConfig() {
  return {
    enabled: Boolean(bucket),
    bucket: bucket ? maskBucket(bucket) : null,
    region,
    publicBaseUrl: Boolean(publicBaseUrl),
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10)
  };
}

function maskBucket(value) {
  if (!value || value.length < 5) return value || '';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export function validateUploadInput({ folder, filename, contentType, sizeBytes }) {
  if (!bucket) {
    throw Object.assign(new Error('S3 upload bucket is not configured. Add S3_UPLOAD_BUCKET in server/.env or Lambda environment.'), { status: 500 });
  }

  const cleanFolder = String(folder || 'documents').toLowerCase().trim();
  if (!allowedFolders.has(cleanFolder)) {
    throw Object.assign(new Error('Invalid upload folder'), { status: 400 });
  }

  const cleanFilename = sanitizeFilename(filename);
  if (!cleanFilename) {
    throw Object.assign(new Error('File name is required'), { status: 400 });
  }

  const mime = String(contentType || '').toLowerCase();
  if (!allowedMimeTypes.has(mime)) {
    throw Object.assign(new Error(`File type not allowed: ${contentType}`), { status: 400 });
  }

  const maxBytes = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
  const size = Number(sizeBytes || 0);
  if (!size || size <= 0) {
    throw Object.assign(new Error('File size is required'), { status: 400 });
  }
  if (size > maxBytes) {
    throw Object.assign(new Error(`File is too large. Maximum allowed size is ${process.env.MAX_UPLOAD_MB || 10} MB.`), { status: 400 });
  }

  return { folder: cleanFolder, fileName: cleanFilename, contentType: mime, sizeBytes: size };
}

export function sanitizeFilename(filename) {
  const base = String(filename || '').split(/[\\/]/).pop() || '';
  return base.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
}

export function buildS3Key({ tenantId, folder, fileName }) {
  const date = new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  return `tenants/${tenantId}/${folder}/${date}/${id}-${fileName}`;
}

export function buildPublicUrl(key) {
  if (publicBaseUrl) return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export async function createPresignedPutUrl({ key, contentType }) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Metadata: {
      app: 'smartledger'
    }
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteS3Object(key) {
  if (!bucket || !key) return;
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
