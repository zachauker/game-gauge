import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createGzip } from 'zlib';
import { PassThrough, Readable } from 'stream';
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// ---- Config ----------------------------------------------------------------

const config = {
  databaseUrl: requireEnv('DATABASE_URL'),
  r2: {
    accountId: requireEnv('R2_ACCOUNT_ID'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    bucket: requireEnv('R2_BUCKET_NAME'),
  },
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10),
  webhookUrl: process.env.BACKUP_WEBHOOK_URL,
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

// ---- S3 Client -------------------------------------------------------------

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

// ---- Helpers ---------------------------------------------------------------

function buildBackupKey(): string {
  const datestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `backups/${datestamp}.sql.gz`;
}

async function notify(message: string, success: boolean): Promise<void> {
  if (!config.webhookUrl) return;
  try {
    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${success ? '✅' : '❌'} **Game Gauge Backup** — ${message}`,
      }),
    });
  } catch {
    console.warn('Failed to send webhook notification');
  }
}

// ---- Pure Node.js dump -----------------------------------------------------

async function dumpDatabase(client: Client): Promise<string> {
  const lines: string[] = [];

  lines.push('-- Game Gauge Database Backup');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('-- ----------------------------------------\n');
  lines.push('SET statement_timeout = 0;');
  lines.push('SET lock_timeout = 0;');
  lines.push('SET client_encoding = \'UTF8\';');
  lines.push('SET standard_conforming_strings = on;\n');

  // Get all tables
  const tablesResult = await client.query<{ tablename: string }>(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const tables = tablesResult.rows.map(r => r.tablename);
  console.log(`Found ${tables.length} tables: ${tables.join(', ')}`);

  // Get enum types
  const enumResult = await client.query<{ typname: string; enumlabel: string }>(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);

  if (enumResult.rows.length > 0) {
    lines.push('-- Enum Types');
    const enums = new Map<string, string[]>();
    for (const row of enumResult.rows) {
      if (!enums.has(row.typname)) enums.set(row.typname, []);
      enums.get(row.typname)!.push(`'${row.enumlabel}'`);
    }
    for (const [name, values] of enums) {
      lines.push(`CREATE TYPE "${name}" AS ENUM (${values.join(', ')});`);
    }
    lines.push('');
  }

  // Dump each table
  for (const table of tables) {
    console.log(`Dumping table: ${table}`);

    // Get column info
    const colResult = await client.query<{ column_name: string; data_type: string; udt_name: string }>(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);

    const columns = colResult.rows;
    const columnNames = columns.map(c => `"${c.column_name}"`).join(', ');

    // Get row count
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM "${table}"`
    );
    const rowCount = parseInt(countResult.rows[0].count, 10);

    lines.push(`-- Table: ${table} (${rowCount} rows)`);
    lines.push(`TRUNCATE TABLE "${table}" CASCADE;`);

    if (rowCount === 0) {
      lines.push('');
      continue;
    }

    // Fetch rows in batches of 500
    const batchSize = 500;
    for (let offset = 0; offset < rowCount; offset += batchSize) {
      const rowsResult = await client.query(
        `SELECT ${columnNames} FROM "${table}" LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      );

      for (const row of rowsResult.rows) {
        const values = columns.map((col) => {
          const val = row[col.column_name];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          if (typeof val === 'number') return String(val);
          if (val instanceof Date) return `'${val.toISOString()}'`;
          if (Array.isArray(val)) {
            const escaped = val.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(',');
            return `'{${escaped}}'`;
          }
          // Escape single quotes for strings
          return `'${String(val).replace(/'/g, "''")}'`;
        });

        lines.push(`INSERT INTO "${table}" (${columnNames}) VALUES (${values.join(', ')});`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ---- Core backup -----------------------------------------------------------

async function runBackup(): Promise<void> {
  const key = buildBackupKey();
  const client = new Client({ connectionString: config.databaseUrl });

  await client.connect();
  console.log('Connected to database');

  try {
    const sql = await dumpDatabase(client);

    console.log(`Dump complete (${(Buffer.byteLength(sql) / 1024 / 1024).toFixed(2)} MB uncompressed)`);
    console.log(`Uploading → s3://${config.r2.bucket}/${key}`);

    const readable = Readable.from([sql]);
    const gzip = createGzip();
    const passthrough = new PassThrough();
    readable.pipe(gzip).pipe(passthrough);

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: config.r2.bucket,
        Key: key,
        Body: passthrough,
        ContentType: 'application/gzip',
      },
    });

    await upload.done();
    console.log(`✅ Backup uploaded: ${key}`);
  } finally {
    await client.end();
  }
}

// ---- Retention cleanup -----------------------------------------------------

async function pruneOldBackups(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.retentionDays);

  const listed = await s3.send(new ListObjectsV2Command({
    Bucket: config.r2.bucket,
    Prefix: 'backups/',
  }));

  const toDelete = (listed.Contents ?? []).filter(
    obj => obj.LastModified && obj.LastModified < cutoff
  );

  for (const obj of toDelete) {
    console.log(`Deleting old backup: ${obj.Key}`);
    await s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: obj.Key! }));
  }

  if (toDelete.length > 0) {
    console.log(`🗑️  Pruned ${toDelete.length} old backup(s)`);
  }
}

// ---- Entry point -----------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  try {
    await runBackup();
    await pruneOldBackups();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const message = `Backup completed in ${duration}s`;
    console.log(message);
    await notify(message, true);
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Backup failed:', message);
    await notify(`Backup failed: ${message}`, false);
    process.exit(1);
  }
}

main();