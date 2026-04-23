// CropsIntelV2 — Google Drive helper
// Uses the cropsintel-backfill-reader service account to upload files into
// the shared Drive folders (position reports archive + daily DB backups).
//
// Auth — tries in order:
//   1) GOOGLE_SERVICE_ACCOUNT_KEY_JSON  (entire JSON as env string — use in CI)
//   2) GOOGLE_SERVICE_ACCOUNT_KEY_PATH  (path to JSON file on disk — local dev)
//   3) GOOGLE_APPLICATION_CREDENTIALS   (Google's default env var)
//
// Target folders (IDs stored in env so we can rotate without redeploy):
//   GDRIVE_POSITION_REPORTS_FOLDER_ID  — 1O2xsvCqBzq4mlCV2ovQL96zW0hbfcvHJ (default)
//   GDRIVE_BACKUPS_FOLDER_ID           — optional, for DB backup rotation
//
// IMPORTANT: the service account must be shared as Editor on the target
// folders via the Drive UI before it can upload. Check the service account
// email (cropsintel-backfill-reader@cropsintel.iam.gserviceaccount.com)
// is in the folder's "People with access" list.

import { google } from 'googleapis';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { config } from 'dotenv';
config();

const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'];

// ============================================================
// Credentials loader
// ============================================================
function loadCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
    } catch (err) {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY_JSON is not valid JSON: ${err.message}`);
    }
  }
  const filePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
                || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath && fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  throw new Error(
    'No Google service-account credentials. Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON (CI) ' +
    'or GOOGLE_SERVICE_ACCOUNT_KEY_PATH (local .env).'
  );
}

// ============================================================
// Auth client (memoized)
// ============================================================
let _auth = null;
let _driveClient = null;

export function getDriveClient() {
  if (_driveClient) return _driveClient;

  const creds = loadCredentials();
  _auth = new google.auth.JWT({
    email: creds.client_email,
    key:   creds.private_key,
    scopes: SCOPES,
  });
  _driveClient = google.drive({ version: 'v3', auth: _auth });
  return _driveClient;
}

// ============================================================
// Folder IDs (from env, with sensible defaults)
// ============================================================
export const FOLDER_POSITION_REPORTS =
  process.env.GDRIVE_POSITION_REPORTS_FOLDER_ID || '1O2xsvCqBzq4mlCV2ovQL96zW0hbfcvHJ';
export const FOLDER_BACKUPS =
  process.env.GDRIVE_BACKUPS_FOLDER_ID || null;

// ============================================================
// Upload a buffer or stream to a folder
// ============================================================
export async function uploadFile({ name, mimeType, content, folderId, description }) {
  if (!name) throw new Error('uploadFile: name required');
  if (!content) throw new Error('uploadFile: content required');
  if (!folderId) throw new Error('uploadFile: folderId required');

  const drive = getDriveClient();

  const body = Buffer.isBuffer(content)
    ? Readable.from(content)
    : typeof content === 'string'
      ? Readable.from(Buffer.from(content, 'utf8'))
      : content; // already a stream

  const { data } = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
      description: description || undefined,
      mimeType: mimeType || 'application/octet-stream',
    },
    media: {
      mimeType: mimeType || 'application/octet-stream',
      body,
    },
    fields: 'id, name, webViewLink, createdTime, size',
    supportsAllDrives: true,
  });

  return data;
}

// ============================================================
// Find existing file in a folder by exact name (idempotent uploads)
// ============================================================
export async function findFileByName(name, folderId) {
  const drive = getDriveClient();
  const q = `'${folderId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`;
  const { data } = await drive.files.list({
    q,
    fields: 'files(id, name, createdTime, size)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return data.files?.[0] || null;
}

// ============================================================
// Upload only if a file with the same name doesn't exist in the folder
// ============================================================
export async function uploadIfNew(params) {
  const existing = await findFileByName(params.name, params.folderId);
  if (existing) {
    return { skipped: true, existing };
  }
  const uploaded = await uploadFile(params);
  return { skipped: false, uploaded };
}

// ============================================================
// Ensure a subfolder exists under a parent (creates if missing)
// ============================================================
export async function ensureSubfolder(name, parentFolderId) {
  const drive = getDriveClient();
  const q = `'${parentFolderId}' in parents and name = '${name.replace(/'/g, "\\'")}' ` +
            `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const list = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (list.data.files?.[0]) return list.data.files[0];

  const { data } = await drive.files.create({
    requestBody: {
      name,
      parents: [parentFolderId],
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id, name',
    supportsAllDrives: true,
  });
  return data;
}

// ============================================================
// Quick sanity check — lists 1 file from the target folder to confirm auth
// ============================================================
export async function ping() {
  try {
    const drive = getDriveClient();
    const { data } = await drive.files.list({
      q: `'${FOLDER_POSITION_REPORTS}' in parents and trashed = false`,
      pageSize: 1,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return {
      ok: true,
      folderId: FOLDER_POSITION_REPORTS,
      sampleFile: data.files?.[0]?.name || '(empty)',
      clientEmail: loadCredentials().client_email,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
