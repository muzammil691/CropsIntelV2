// CropsIntelV2 — Google Drive uploader
// Two jobs:
//   1) archiveABCReports() — download PDFs from abc_position_reports.file_url
//      and upload to the position-reports Drive folder (idempotent by filename).
//   2) backupDatabase()    — dump key tables as JSON and upload to a dated
//      subfolder under GDRIVE_BACKUPS_FOLDER_ID (falls back to position folder
//      under a Backups/ subfolder if the dedicated one isn't set).
//
// Both are safe to run on a cron because:
//   - archive: `uploadIfNew` checks for existing filenames before uploading.
//   - backup:  each file is dated (YYYY-MM-DD/HH-MM) so collisions are rare;
//              if they happen Drive keeps both copies (not a blocker).
//
// CLI usage:
//   node src/autonomous/gdrive-uploader.js ping      # auth check
//   node src/autonomous/gdrive-uploader.js archive   # run archive
//   node src/autonomous/gdrive-uploader.js backup    # run backup
//   node src/autonomous/gdrive-uploader.js all       # both

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';
import {
  uploadIfNew, uploadFile, ensureSubfolder,
  FOLDER_POSITION_REPORTS, FOLDER_BACKUPS, ping,
} from '../lib/gdrive.js';

const ARCHIVE_BATCH = parseInt(process.env.GDRIVE_ARCHIVE_BATCH || '25', 10);

// ============================================================
// Logging
// ============================================================
async function log(action, status, details = {}) {
  try {
    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: `gdrive-${action}`,
      status,
      records_found:    details.found    || 0,
      records_inserted: details.uploaded || 0,
      error_message:    details.error    || null,
      duration_ms:      details.duration || 0,
      metadata:         details.metadata || {},
      completed_at:     new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`[gdrive] log failed: ${err.message}`);
  }
}

// ============================================================
// Archive ABC position-report PDFs
// ============================================================
export async function archiveABCReports() {
  const start = Date.now();
  let found = 0, uploaded = 0, skipped = 0, failed = 0;

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('abc_position_reports')
      .select('id, report_year, report_month, file_url, crop_year')
      .not('file_url', 'is', null)
      .order('report_year', { ascending: false })
      .order('report_month', { ascending: false })
      .limit(ARCHIVE_BATCH);

    if (error) throw new Error(`fetch abc_position_reports: ${error.message}`);
    found = rows?.length || 0;
    if (found === 0) {
      console.log('[gdrive-archive] no reports to archive');
      return { found: 0, uploaded: 0, skipped: 0, failed: 0 };
    }

    console.log(`[gdrive-archive] scanning ${found} reports...`);

    for (const r of rows) {
      const mmm = String(r.report_month).padStart(2, '0');
      const name = `ABC_Position_${r.report_year}-${mmm}.pdf`;
      try {
        // Fetch the PDF bytes
        const res = await fetch(r.file_url);
        if (!res.ok) {
          failed += 1;
          console.warn(`[gdrive-archive] fetch failed ${name}: HTTP ${res.status}`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());

        const result = await uploadIfNew({
          name,
          folderId: FOLDER_POSITION_REPORTS,
          mimeType: 'application/pdf',
          content: buf,
          description: `ABC Position Report — Crop Year ${r.crop_year}, ${r.report_year}-${mmm}`,
        });

        if (result.skipped) {
          skipped += 1;
        } else {
          uploaded += 1;
          console.log(`[gdrive-archive] uploaded ${name} (${result.uploaded.id})`);
        }
      } catch (err) {
        failed += 1;
        console.warn(`[gdrive-archive] ${name} failed: ${err.message || err}`);
      }
    }

    const duration = Date.now() - start;
    console.log(`[gdrive-archive] done: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed (${duration}ms)`);
    await log('archive', failed === 0 ? 'success' : 'partial', {
      found, uploaded, duration,
      metadata: { skipped, failed, batchSize: ARCHIVE_BATCH },
    });
    return { found, uploaded, skipped, failed, duration };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error(`[gdrive-archive] fatal: ${msg}`);
    await log('archive', 'failed', { found, error: msg, duration: Date.now() - start });
    return { found, uploaded, skipped, failed, error: msg };
  }
}

// ============================================================
// Daily DB backup — dump key tables to JSON
// ============================================================
const BACKUP_TABLES = [
  'user_profiles',
  'abc_position_reports',
  'abc_shipment_reports',
  'abc_crop_receipts',
  'abc_forecasts',
  'crm_activities',
  'scraping_logs',
  'pipeline_runs',
];

export async function backupDatabase() {
  const start = Date.now();
  let uploadedCount = 0;
  const results = [];
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().slice(11, 16).replace(':', '-'); // HH-MM

  try {
    // Put backups under Backups/YYYY-MM-DD/ — use dedicated folder if set,
    // otherwise nest inside the position-reports folder so nothing gets lost.
    const rootBackupFolder = FOLDER_BACKUPS || FOLDER_POSITION_REPORTS;
    const datedFolder = await ensureSubfolder(`Backups_${dateStr}`, rootBackupFolder);

    for (const table of BACKUP_TABLES) {
      try {
        const { data, error, count } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact' });

        if (error) {
          console.warn(`[gdrive-backup] ${table} query failed: ${error.message}`);
          results.push({ table, ok: false, error: error.message });
          continue;
        }

        const payload = JSON.stringify({
          table,
          row_count: data?.length || 0,
          exact_count: count ?? null,
          exported_at: now.toISOString(),
          rows: data || [],
        }, null, 2);

        const fileName = `${table}_${timeStr}.json`;
        const uploaded = await uploadFile({
          name: fileName,
          folderId: datedFolder.id,
          mimeType: 'application/json',
          content: payload,
          description: `CropsIntel DB backup — ${table} @ ${now.toISOString()}`,
        });

        uploadedCount += 1;
        results.push({ table, ok: true, rows: data?.length || 0, id: uploaded.id });
        console.log(`[gdrive-backup] ${table}: ${data?.length || 0} rows → ${uploaded.name}`);
      } catch (err) {
        results.push({ table, ok: false, error: err?.message || String(err) });
        console.warn(`[gdrive-backup] ${table} failed: ${err?.message || err}`);
      }
    }

    const duration = Date.now() - start;
    const anyFailed = results.some(r => !r.ok);
    await log('backup', anyFailed ? 'partial' : 'success', {
      found: BACKUP_TABLES.length,
      uploaded: uploadedCount,
      duration,
      metadata: { folder: datedFolder.name, results },
    });
    console.log(`[gdrive-backup] done: ${uploadedCount}/${BACKUP_TABLES.length} tables (${duration}ms)`);
    return { uploadedCount, total: BACKUP_TABLES.length, folder: datedFolder.name, results, duration };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error(`[gdrive-backup] fatal: ${msg}`);
    await log('backup', 'failed', { error: msg, duration: Date.now() - start });
    return { uploadedCount, error: msg };
  }
}

// ============================================================
// CLI
// ============================================================
const __isMain = import.meta.url === `file://${process.argv[1]}`;
if (__isMain) {
  const arg = process.argv[2] || 'ping';
  (async () => {
    try {
      if (arg === 'ping') {
        const r = await ping();
        console.log('[gdrive-ping]', r);
        process.exit(r.ok ? 0 : 1);
      }
      if (arg === 'archive' || arg === 'all') {
        const r = await archiveABCReports();
        console.log('[gdrive-archive] result:', r);
      }
      if (arg === 'backup' || arg === 'all') {
        const r = await backupDatabase();
        console.log('[gdrive-backup] result:', r);
      }
      process.exit(0);
    } catch (err) {
      console.error('[gdrive-uploader] crash:', err);
      process.exit(1);
    }
  })();
}
