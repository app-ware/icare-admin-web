import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sampleCenters } from '@/features/centers/sample-data';
import { centerKey, type CenterRef } from '@/domain/centers';
import {
  emptyProfile,
  type CenterDraftData,
  type CenterProfile,
  type SavedDraft,
  type ManagedCenter,
} from '@/domain/management';
import { PortalError } from './http';
import {
  BRANDING_RETENTION_MS,
  brandingKinds,
  type BrandingAsset,
  type BrandingKind,
} from '@/domain/branding';

export const IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 8 * 60 * 60_000;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const profileRevision = (profile: CenterProfile) => digest(JSON.stringify(profile));
export interface SessionRecord {
  id: string;
  dealerId: number;
  mode: 'legacy' | 'preview';
  credentialStamp: string;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
}

// Single-host durable storage, outside the web root. Use a shared store before multi-host deployment.
export class PortalStore {
  readonly db: DatabaseSync;
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS preview_cowpay_readiness (center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,row_count INTEGER NOT NULL,type_mismatch INTEGER NOT NULL,merchant_code_present INTEGER NOT NULL,merchant_hash_present INTEGER NOT NULL,live_token_present INTEGER NOT NULL,staging_token_present INTEGER NOT NULL,enabled_known INTEGER NOT NULL,enabled_value INTEGER,updated_at TEXT,PRIMARY KEY(center_id,center_type));
      CREATE TABLE IF NOT EXISTS preview_input_modes (center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,input_type INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(center_id,center_type));
      CREATE TABLE IF NOT EXISTS input_mode_versions (mode TEXT NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(mode,center_id,center_type));
      CREATE TABLE IF NOT EXISTS input_mode_operations (id TEXT PRIMARY KEY,mode TEXT NOT NULL,actor_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,previous_type INTEGER,next_type INTEGER,action TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS preview_qr_subjects (center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,ordinal INTEGER NOT NULL,token TEXT NOT NULL,PRIMARY KEY(center_id,center_type,ordinal));
      CREATE TABLE IF NOT EXISTS qr_jobs (id TEXT PRIMARY KEY,mode TEXT NOT NULL,actor_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,revision TEXT NOT NULL,watermark_id TEXT,watermark_data BLOB,state TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,UNIQUE(mode,actor_id,request_id));
      CREATE INDEX IF NOT EXISTS qr_job_scope ON qr_jobs(mode,actor_id,center_id,center_type,created_at);
      CREATE TABLE IF NOT EXISTS qr_items (id TEXT PRIMARY KEY,job_id TEXT NOT NULL,ordinal INTEGER NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,data BLOB,lease TEXT,lease_until INTEGER,attempts INTEGER NOT NULL DEFAULT 0,UNIQUE(job_id,ordinal));
      CREATE TABLE IF NOT EXISTS draft_images (id TEXT PRIMARY KEY,mode TEXT NOT NULL,dealer_id INTEGER NOT NULL,draft_id TEXT NOT NULL,kind TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,bytes INTEGER NOT NULL,data BLOB NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER);
      CREATE INDEX IF NOT EXISTS draft_image_scope ON draft_images(mode,dealer_id,draft_id,state);
      CREATE TABLE IF NOT EXISTS branding_assets (id TEXT PRIMARY KEY,mode TEXT NOT NULL,actor_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,kind TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,bytes INTEGER NOT NULL,data BLOB NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER);
      CREATE INDEX IF NOT EXISTS branding_asset_scope ON branding_assets(mode,center_id,center_type,state);
      CREATE TABLE IF NOT EXISTS branding_slots (mode TEXT NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,kind TEXT NOT NULL,asset_id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(mode,center_id,center_type,kind));
      CREATE TABLE IF NOT EXISTS branding_operations (id TEXT PRIMARY KEY,mode TEXT NOT NULL,actor_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,previous_assets TEXT NOT NULL,next_assets TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS preview_bus_settings (center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,bus_id INTEGER NOT NULL,values_json TEXT NOT NULL,PRIMARY KEY(center_id,center_type,bus_id));
      CREATE TABLE IF NOT EXISTS bus_versions (mode TEXT NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,bus_id INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(mode,center_id,center_type,bus_id));
      CREATE TABLE IF NOT EXISTS bus_operations (id TEXT PRIMARY KEY,mode TEXT NOT NULL,actor_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,bus_id INTEGER NOT NULL,action TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,completed_at INTEGER);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, id TEXT UNIQUE NOT NULL, dealer_id INTEGER NOT NULL, mode TEXT NOT NULL, credential_stamp TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS throttle (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS preview_centers (id INTEGER NOT NULL, type INTEGER NOT NULL, domain TEXT NOT NULL UNIQUE, profile TEXT NOT NULL, active INTEGER, owner_id INTEGER NOT NULL, time_zone TEXT, PRIMARY KEY(id,type));
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, dealer_id INTEGER NOT NULL, mode TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_id INTEGER, published_type INTEGER);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preview_dealers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL COLLATE NOCASE UNIQUE, email TEXT NOT NULL, active INTEGER NOT NULL, is_admin INTEGER NOT NULL, created_date TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preview_dealer_centers (dealer_id INTEGER NOT NULL, center_id INTEGER NOT NULL, center_type INTEGER NOT NULL, PRIMARY KEY(dealer_id,center_id,center_type));
      CREATE TABLE IF NOT EXISTS dealer_operations (id TEXT PRIMARY KEY, mode TEXT NOT NULL, actor_id INTEGER NOT NULL, target_id INTEGER, action TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, completed_at INTEGER);
      CREATE TABLE IF NOT EXISTS preview_center_users (id INTEGER PRIMARY KEY,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,local_id INTEGER,secure_id INTEGER,username TEXT NOT NULL,local_username TEXT NOT NULL,first_name TEXT NOT NULL,last_name TEXT NOT NULL,email TEXT NOT NULL,active INTEGER,is_admin INTEGER,is_super_admin INTEGER NOT NULL,issues TEXT NOT NULL,roles TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS center_user_operations (id TEXT PRIMARY KEY,mode TEXT NOT NULL,actor_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,user_key TEXT NOT NULL,action TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,completed_at INTEGER);
      CREATE TABLE IF NOT EXISTS preview_report_grants (dealer_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,PRIMARY KEY(dealer_id,center_id,center_type));
      CREATE TABLE IF NOT EXISTS report_exports (id TEXT PRIMARY KEY,dealer_id INTEGER NOT NULL,mode TEXT NOT NULL,params TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,finished_at INTEGER,filename TEXT);
      CREATE TABLE IF NOT EXISTS preview_status_grants (dealer_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,PRIMARY KEY(dealer_id,center_id,center_type));
      CREATE TABLE IF NOT EXISTS preview_status_versions (center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(center_id,center_type));
      CREATE TABLE IF NOT EXISTS center_status_operations (id TEXT PRIMARY KEY,mode TEXT NOT NULL,actor_id INTEGER NOT NULL,actor_name TEXT NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,previous_code INTEGER,next_code INTEGER NOT NULL,reason TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,completed_at INTEGER);
      CREATE INDEX IF NOT EXISTS center_status_history ON center_status_operations(mode,center_id,center_type,created_at);
      CREATE TABLE IF NOT EXISTS preview_alert_grants (dealer_id INTEGER NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,PRIMARY KEY(dealer_id,center_id,center_type));
      CREATE TABLE IF NOT EXISTS preview_alerts (center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,message TEXT NOT NULL,expiry_date TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(center_id,center_type));
      CREATE TABLE IF NOT EXISTS live_alert_versions (center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(center_id,center_type));
      CREATE TABLE IF NOT EXISTS preview_alert_versions (center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(center_id,center_type));
      CREATE TABLE IF NOT EXISTS alert_batches (id TEXT PRIMARY KEY,actor_id INTEGER NOT NULL,mode TEXT NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,lease_until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS alert_batch_targets (batch_id TEXT NOT NULL,center_id INTEGER NOT NULL,center_type INTEGER NOT NULL,revision TEXT NOT NULL,state TEXT NOT NULL,code TEXT,message TEXT,retryable INTEGER NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(batch_id,center_id,center_type));`);
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = action();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  createSession(
    dealerId: number,
    mode: SessionRecord['mode'],
    credentialStamp: string,
    now = Date.now(),
  ) {
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    this.db
      .prepare('DELETE FROM sessions WHERE expires_at<=? OR last_seen<=?')
      .run(now, now - IDLE_MS);
    this.db
      .prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?)')
      .run(digest(token), id, dealerId, mode, credentialStamp, now, now, now + ABSOLUTE_MS);
    return { token, id, expiresAt: now + ABSOLUTE_MS };
  }
  session(token: string | undefined, now = Date.now()): SessionRecord | null {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db.prepare('SELECT * FROM sessions WHERE hash=?').get(digest(token));
    if (!row) return null;
    if (Number(row.expires_at) <= now || Number(row.last_seen) + IDLE_MS <= now) {
      this.revoke(token);
      return null;
    }
    this.db.prepare('UPDATE sessions SET last_seen=? WHERE hash=?').run(now, digest(token));
    return {
      id: String(row.id),
      dealerId: Number(row.dealer_id),
      mode: row.mode as SessionRecord['mode'],
      credentialStamp: String(row.credential_stamp),
      createdAt: Number(row.created_at),
      lastSeen: now,
      expiresAt: Number(row.expires_at),
    };
  }
  revoke(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));
  }
  revokeDealerSessions(dealerId: number, mode: SessionRecord['mode']) {
    this.db.prepare('DELETE FROM sessions WHERE dealer_id=? AND mode=?').run(dealerId, mode);
  }
  sessions(dealerId: number, mode: SessionRecord['mode'], now = Date.now()) {
    return this.db
      .prepare(
        'SELECT id,created_at,last_seen,expires_at FROM sessions WHERE dealer_id=? AND mode=? AND expires_at>? AND last_seen>? ORDER BY created_at DESC',
      )
      .all(dealerId, mode, now, now - IDLE_MS)
      .map((r) => ({
        id: String(r.id),
        createdAt: Number(r.created_at),
        lastSeen: Number(r.last_seen),
        expiresAt: Number(r.expires_at),
      }));
  }
  revokeOthers(dealerId: number, mode: SessionRecord['mode'], currentId: string) {
    this.db
      .prepare('DELETE FROM sessions WHERE dealer_id=? AND mode=? AND id<>?')
      .run(dealerId, mode, currentId);
  }
  consumeLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
    return this.transaction(() => {
      this.db.prepare('DELETE FROM throttle WHERE reset_at<=?').run(now);
      const row = this.db.prepare('SELECT attempts,reset_at FROM throttle WHERE key=?').get(key);
      if (row && Number(row.attempts) >= limit) return false;
      this.db
        .prepare(
          'INSERT INTO throttle VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1',
        )
        .run(key, now + windowMs);
      return true;
    });
  }
  seedPreview() {
    this.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM settings WHERE key='preview-seeded'").get()) return;
      for (const c of sampleCenters)
        this.db.prepare('INSERT INTO preview_centers VALUES (?,?,?,?,?,?,?)').run(
          c.id,
          c.type,
          c.domain,
          JSON.stringify({
            ...emptyProfile,
            name: c.name,
            manager: c.manager,
            email: c.email,
            address: c.city,
          }),
          c.active ? 1 : 0,
          [101, 103].includes(c.id) ? 900002 : 900001,
          c.type === 4 ? null : 'Africa/Cairo',
        );
      this.db.prepare("INSERT INTO settings VALUES ('preview-seeded','1')").run();
    });
  }
  previewCenters(): (ManagedCenter & { ownerId: number })[] {
    this.seedPreview();
    return this.db
      .prepare('SELECT * FROM preview_centers')
      .all()
      .map((r) => {
        const profile = JSON.parse(String(r.profile)) as CenterProfile;
        return {
          id: Number(r.id),
          type: Number(r.type) as 1 | 3 | 4,
          domain: String(r.domain),
          profile,
          active: r.active === null ? null : r.active === 1,
          revision: profileRevision(profile),
          timeZone: r.time_zone === null ? null : String(r.time_zone),
          canEdit: false,
          ownerId: Number(r.owner_id),
        };
      });
  }
  updatePreview(ref: CenterRef, revision: string, profile: CenterProfile) {
    return this.transaction(() => {
      const row = this.db
        .prepare('SELECT profile FROM preview_centers WHERE id=? AND type=?')
        .get(ref.id, ref.type);
      if (!row) throw new PortalError(404, 'NOT_FOUND', 'Center not found.');
      if (profileRevision(JSON.parse(String(row.profile))) !== revision)
        throw new PortalError(
          409,
          'REVISION_CONFLICT',
          'This center changed while you were editing. Reload the latest details before saving.',
        );
      this.db
        .prepare('UPDATE preview_centers SET profile=? WHERE id=? AND type=?')
        .run(JSON.stringify(profile), ref.id, ref.type);
    });
  }
  drafts(dealerId: number, mode: SessionRecord['mode']): SavedDraft[] {
    return this.db
      .prepare('SELECT * FROM drafts WHERE dealer_id=? AND mode=? ORDER BY updated_at DESC')
      .all(dealerId, mode)
      .map((r) => ({
        id: String(r.id),
        data: JSON.parse(String(r.data)),
        revision: Number(r.revision),
        updatedAt: Number(r.updated_at),
        branding: this.draftBranding(dealerId, mode, String(r.id)),
        published:
          r.published_id === null
            ? null
            : { id: Number(r.published_id), type: Number(r.published_type) as 1 | 3 | 4 },
      }));
  }
  draftBranding(
    dealerId: number,
    mode: SessionRecord['mode'],
    draftId: string,
  ): SavedDraft['branding'] {
    const result: SavedDraft['branding'] = { logo: null, photo: null, watermark: null };
    const rows = this.db
      .prepare(
        `SELECT a.id,a.kind,a.mime,a.width,a.height,a.bytes,a.created_at FROM draft_images a JOIN drafts d ON d.id=a.draft_id AND d.dealer_id=a.dealer_id AND d.mode=a.mode WHERE d.id=? AND d.dealer_id=? AND d.mode=? AND d.published_id IS NULL AND a.state='saved' AND ((a.kind='logo' AND json_extract(d.data,'$.branding.logo')=a.id) OR (a.kind='photo' AND json_extract(d.data,'$.branding.photo')=a.id) OR (a.kind='watermark' AND json_extract(d.data,'$.branding.watermark')=a.id))`,
      )
      .all(draftId, dealerId, mode);
    for (const r of rows) {
      const kind = r.kind as BrandingKind;
      result[kind] = {
        id: String(r.id),
        kind,
        url: `/api/center-drafts/${draftId}/branding/assets/${r.id}`,
        mime: r.mime as BrandingAsset['mime'],
        width: Number(r.width),
        height: Number(r.height),
        bytes: Number(r.bytes),
        createdAt: Number(r.created_at),
        expiresAt: null,
      };
    }
    return result;
  }
  saveDraft(
    dealerId: number,
    mode: SessionRecord['mode'],
    data: CenterDraftData,
    id?: string,
    revision?: number,
    guard?: () => void,
  ) {
    return this.transaction(() => {
      guard?.();
      const draftId = id ?? randomUUID();
      const before = id
        ? this.db
            .prepare(
              'SELECT data FROM drafts WHERE id=? AND dealer_id=? AND mode=? AND revision=? AND published_id IS NULL',
            )
            .get(id, dealerId, mode, revision ?? 0)
        : null;
      if (id && !before)
        throw new PortalError(
          409,
          'DRAFT_CONFLICT',
          'This draft is unavailable or changed. Reload the saved draft.',
        );
      const previous = before ? (JSON.parse(String(before.data)) as CenterDraftData) : null;
      // Older two-slot clients must preserve a saved watermark when they omit its field.
      const branding =
        data.branding === undefined
          ? previous?.branding
          : {
              ...data.branding,
              watermark:
                data.branding.watermark === undefined
                  ? previous?.branding?.watermark
                  : data.branding.watermark,
            };
      for (const kind of brandingKinds) {
        const assetId = branding?.[kind];
        if (!assetId) continue;
        const asset = this.db
          .prepare(
            "SELECT id FROM draft_images WHERE id=? AND mode=? AND dealer_id=? AND draft_id=? AND kind=? AND (state='saved' OR (state='staged' AND expires_at>?))",
          )
          .get(assetId, mode, dealerId, draftId, kind, Date.now());
        if (!asset)
          throw new PortalError(
            409,
            'DRAFT_IMAGE_UNAVAILABLE',
            'A draft image expired or is unavailable. Choose that image again.',
          );
      }
      const nextData = branding ? { ...data, branding } : data;
      for (const kind of brandingKinds) {
        const oldId = previous?.branding?.[kind],
          nextId = branding?.[kind];
        if (oldId && oldId !== nextId)
          this.db
            .prepare(
              "UPDATE draft_images SET state='retired',expires_at=? WHERE id=? AND mode=? AND dealer_id=? AND draft_id=?",
            )
            .run(Date.now() + BRANDING_RETENTION_MS, oldId, mode, dealerId, draftId);
        if (nextId)
          this.db
            .prepare("UPDATE draft_images SET state='saved',expires_at=NULL WHERE id=?")
            .run(nextId);
      }
      if (id) {
        const changed = this.db
          .prepare(
            'UPDATE drafts SET data=?,revision=revision+1,updated_at=? WHERE id=? AND dealer_id=? AND mode=? AND revision=? AND published_id IS NULL',
          )
          .run(JSON.stringify(nextData), Date.now(), id, dealerId, mode, revision ?? 0);
        if (!changed.changes)
          throw new PortalError(
            409,
            'DRAFT_CONFLICT',
            'This draft is unavailable or changed. Refresh your drafts.',
          );
      } else
        this.db
          .prepare('INSERT INTO drafts VALUES (?,?,?,?,1,?,NULL,NULL)')
          .run(draftId, dealerId, mode, JSON.stringify(nextData), Date.now());
      return this.drafts(dealerId, mode).find((d) => d.id === draftId)!;
    });
  }
  deleteDraft(
    dealerId: number,
    mode: SessionRecord['mode'],
    id: string,
    revision?: number,
    guard?: () => void,
  ) {
    return this.transaction(() => {
      guard?.();
      const current = this.db
        .prepare(
          'SELECT revision FROM drafts WHERE id=? AND dealer_id=? AND mode=? AND published_id IS NULL',
        )
        .get(id, dealerId, mode);
      if (!current) throw new PortalError(404, 'NOT_FOUND', 'Draft not found.');
      if (revision !== undefined && Number(current.revision) !== revision)
        throw new PortalError(
          409,
          'DRAFT_CONFLICT',
          'This draft changed. Refresh your drafts before deleting.',
        );
      const result = this.db
        .prepare(
          'DELETE FROM drafts WHERE id=? AND dealer_id=? AND mode=? AND published_id IS NULL',
        )
        .run(id, dealerId, mode);
      if (!result.changes) throw new PortalError(404, 'NOT_FOUND', 'Draft not found.');
      this.db
        .prepare('DELETE FROM draft_images WHERE draft_id=? AND dealer_id=? AND mode=?')
        .run(id, dealerId, mode);
    });
  }
  publishPreview(dealerId: number, id: string, revision: number, guard?: () => void): CenterRef {
    this.seedPreview();
    return this.transaction(() => {
      guard?.();
      const row = this.db
        .prepare("SELECT * FROM drafts WHERE id=? AND dealer_id=? AND mode='preview'")
        .get(id, dealerId);
      if (!row) throw new PortalError(404, 'NOT_FOUND', 'Draft not found.');
      if (row.published_id !== null)
        return { id: Number(row.published_id), type: Number(row.published_type) as 1 | 3 | 4 };
      if (Number(row.revision) !== revision)
        throw new PortalError(409, 'DRAFT_CONFLICT', 'This draft changed. Refresh and try again.');
      const data = JSON.parse(String(row.data)) as CenterDraftData;
      if (this.db.prepare('SELECT 1 FROM preview_centers WHERE domain=?').get(data.domain))
        throw new PortalError(409, 'DOMAIN_EXISTS', 'This domain is already in use.');
      const next =
        Number(this.db.prepare('SELECT MAX(id) AS id FROM preview_centers').get()!.id) + 1;
      this.db
        .prepare('INSERT INTO preview_centers VALUES (?,?,?,?,1,?,?)')
        .run(
          next,
          data.type,
          data.domain,
          JSON.stringify(data.profile),
          dealerId,
          data.type === 4 ? null : 'Africa/Cairo',
        );
      this.db
        .prepare('INSERT OR IGNORE INTO preview_dealer_centers VALUES (?,?,?)')
        .run(dealerId, next, data.type);
      const imageIds: Partial<Record<BrandingKind, string>> = {};
      for (const kind of brandingKinds) {
        const imageId = data.branding?.[kind];
        if (!imageId) continue;
        const newId = randomUUID();
        const copied = this.db
          .prepare(
            `INSERT INTO branding_assets SELECT ?,'preview',dealer_id,?,?,kind,mime,width,height,bytes,data,'published',?,NULL FROM draft_images WHERE id=? AND draft_id=? AND dealer_id=? AND mode='preview' AND kind=? AND state='saved'`,
          )
          .run(newId, next, data.type, Date.now(), imageId, id, dealerId, kind);
        if (copied.changes !== 1)
          throw new PortalError(
            409,
            'DRAFT_IMAGE_UNAVAILABLE',
            'A saved draft image is unavailable. Reload the draft.',
          );
        this.db
          .prepare("INSERT INTO branding_slots VALUES('preview',?,?,?,?,1)")
          .run(next, data.type, kind, newId);
        imageIds[kind] = newId;
      }
      if (brandingKinds.some((k) => imageIds[k]))
        this.db
          .prepare("INSERT INTO branding_operations VALUES(?,'preview',?,?,?,?,?,?)")
          .run(
            randomUUID(),
            dealerId,
            next,
            data.type,
            JSON.stringify({ logo: null, photo: null, watermark: null }),
            JSON.stringify(imageIds),
            Date.now(),
          );
      this.db
        .prepare("DELETE FROM draft_images WHERE draft_id=? AND dealer_id=? AND mode='preview'")
        .run(id, dealerId);
      this.db
        .prepare('UPDATE drafts SET published_id=?,published_type=?,updated_at=? WHERE id=?')
        .run(next, data.type, Date.now(), id);
      return { id: next, type: data.type };
    });
  }
  close() {
    this.db.close();
  }
}
const globalStore = globalThis as typeof globalThis & { icareStore?: PortalStore };
export function getStore() {
  // Supplied at process launch, so Next cannot trace/watch the mutable data file as source.
  const file = process.env.ICARE_STORAGE_PATH;
  if (!file)
    throw new PortalError(
      503,
      'STORAGE_NOT_CONFIGURED',
      'Private application storage needs to be configured by your administrator.',
    );
  return (globalStore.icareStore ??= new PortalStore(file));
}
