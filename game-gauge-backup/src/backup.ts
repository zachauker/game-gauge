import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { execSync, spawn } from 'child_process';
import { createGzip } from 'zlib';
import { PassThrough } from 'stream';
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
  // Optional: a Discord or Slack webhook URL for notifications
  webhookUrl: process.env.BACKUP_WEBHOOK_URL,
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

// ---- S3 Client (R2 is S3-compatible) --------------------------------------

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
  const now = new Date();
  const datestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `backups/${datestamp}.sql.gz`;
}

function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.slice(1),
    user: parsed.username,
    password: parsed.password,
  };
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

// ---- Core backup logic -----------------------------------------------------

async function runBackup(): Promise<void> {
  const key = buildBackupKey();
  const db = parseDatabaseUrl(config.databaseUrl);

  console.log(`Starting backup → s3://${config.r2.bucket}/${key}`);

  // Stream pg_dump | gzip → S3 without writing to disk
  const passthrough = new PassThrough();
  const gzip = createGzip();

  const pgDump = spawn(
    'pg_dump',
    [
      '--host', db.host,
      '--port', db.port,
      '--username', db.user,
      '--dbname', db.database,
      '--no-password',
      '--format', 'plain',
      '--no-owner',
      '--no-acl',
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: db.password,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  pgDump.stderr.on('data', (data: Buffer) => {
    console.error('pg_dump stderr:', data.toString());
  });

  pgDump.stdout.pipe(gzip).pipe(passthrough);

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: config.r2.bucket,
      Key: key,
      Body: passthrough,
      ContentType: 'application/gzip',
    },
  });

  await new Promise<void>((resolve, reject) => {
    pgDump.on('exit', (code) => {
      if (code !== 0) reject(new Error(`pg_dump exited with code ${code}`));
    });
    upload.done().then(() => resolve()).catch(reject);
  });

  console.log(`✅ Backup uploaded: ${key}`);
}

// ---- Retention cleanup -----------------------------------------------------

async function pruneOldBackups(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.retentionDays);

  const listed = await s3.send(new ListObjectsV2Command({
    Bucket: config.r2.bucket,
    Prefix: 'backups/',
  }));

  const toDelete = (listed.Contents ?? []).filter((obj) => {
    return obj.LastModified && obj.LastModified < cutoff;
  });

  for (const obj of toDelete) {
    console.log(`Deleting old backup: ${obj.Key}`);
    await s3.send(new DeleteObjectCommand({
      Bucket: config.r2.bucket,
      Key: obj.Key!,
    }));
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