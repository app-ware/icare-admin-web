import 'server-only';
import { centerKey, centerRefSchema } from '@/domain/centers';
import type { DealerDetail, DealerSummary } from '@/domain/dealers';
import { digest, type PortalStore } from '@/server/store';

export function seedDealerPreview(store: PortalStore) {
  store.seedPreview();
  if (!store.db.prepare("SELECT 1 FROM settings WHERE key='preview-report-grants-seeded'").get())
    store.transaction(() => {
      store.db.prepare('INSERT OR IGNORE INTO preview_report_grants VALUES (900002,104,3)').run();
      store.db
        .prepare("INSERT OR IGNORE INTO settings VALUES ('preview-report-grants-seeded','1')")
        .run();
    });
  store.transaction(() => {
    if (store.db.prepare("SELECT 1 FROM settings WHERE key='preview-dealers-seeded'").get()) return;
    const insert = store.db.prepare('INSERT OR IGNORE INTO preview_dealers VALUES (?,?,?,?,?,?,?)');
    insert.run(900001, 'Alex Morgan', 'demo.admin', 'alex@example.test', 1, 1, '2026-10-21');
    insert.run(900002, 'Jamie Taylor', 'demo.dealer', 'jamie@example.test', 1, 0, '2026-10-21');
    store.db.exec(`INSERT OR IGNORE INTO preview_dealer_centers
      SELECT owner_id,id,type FROM preview_centers;
      INSERT INTO settings VALUES ('preview-dealers-seeded','1');`);
  });
}
export function previewDealerDetail(store: PortalStore, id: number): DealerDetail | null {
  const row = store.db.prepare('SELECT * FROM preview_dealers WHERE id=?').get(id);
  if (!row) return null;
  const links = store.db
    .prepare(
      `SELECT l.center_id,l.center_type,p.profile
    FROM preview_dealer_centers l LEFT JOIN preview_centers p
      ON p.id=l.center_id AND p.type=l.center_type WHERE dealer_id=?
    ORDER BY l.center_type,l.center_id`,
    )
    .all(id);
  const centers = links.flatMap((link) => {
    const ref = centerRefSchema.safeParse({
      id: Number(link.center_id),
      type: Number(link.center_type),
    });
    if (!ref.success) return [];
    return [
      {
        ...ref.data,
        name: link.profile
          ? String(JSON.parse(String(link.profile)).name)
          : `Unavailable center #${link.center_id}`,
        available: Boolean(link.profile),
      },
    ];
  });
  const summary: DealerSummary = {
    id: Number(row.id),
    name: String(row.name),
    username: String(row.username),
    email: String(row.email),
    active: Boolean(row.active),
    isSuperAdmin: Boolean(row.is_admin),
    centerCount: centers.length,
    createdDate: String(row.created_date),
  };
  return {
    ...summary,
    centers,
    unsupportedAssignments: links.length - centers.length,
    revision: digest(
      JSON.stringify([summary, links.map((l) => `${l.center_id}_${l.center_type}`)]),
    ),
  };
}
export function previewOwnedKeys(store: PortalStore, id: number) {
  return previewDealerDetail(store, id)?.centers.map(centerKey) ?? [];
}
