import 'server-only';
import type { CenterRef } from '@/domain/centers';
import type { PortalStore } from '@/server/store';
export function seedCenterUsers(store: PortalStore) {
  store.seedPreview();
  store.transaction(() => {
    if (store.db.prepare("SELECT 1 FROM settings WHERE key='preview-center-users-seeded'").get())
      return;
    const insert = store.db.prepare(
      'INSERT INTO preview_center_users VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    insert.run(
      1,
      101,
      1,
      1,
      1,
      'cedar.admin',
      'cedar.admin',
      'Taylor',
      'Reed',
      'taylor@example.test',
      1,
      1,
      0,
      '[]',
      '["Center administrator"]',
    );
    insert.run(
      2,
      101,
      1,
      2,
      2,
      'cedar.teacher',
      'cedar.teacher',
      'Sam',
      'River',
      'sam@example.test',
      1,
      0,
      0,
      '[]',
      '["Educator"]',
    );
    insert.run(
      3,
      101,
      1,
      3,
      null,
      '',
      'cedar.local',
      'Casey',
      'Lane',
      'casey@example.test',
      null,
      null,
      0,
      '[]',
      '[]',
    );
    insert.run(
      4,
      101,
      1,
      null,
      4,
      'cedar.unlinked',
      '',
      '',
      '',
      '',
      1,
      0,
      0,
      '["missing_local"]',
      '[]',
    );
    insert.run(
      5,
      102,
      4,
      1,
      5,
      'horizon.admin',
      'horizon.admin',
      'Robin',
      'Gray',
      'robin@example.test',
      1,
      1,
      0,
      '[]',
      '["School administrator"]',
    );
    insert.run(
      6,
      103,
      1,
      1,
      6,
      'olive.admin',
      'olive.admin',
      'Avery',
      'Wren',
      'avery@example.test',
      1,
      1,
      0,
      '[]',
      '["Center administrator"]',
    );
    insert.run(
      7,
      104,
      3,
      1,
      7,
      'bright.admin',
      'bright.admin',
      'Jordan',
      'Blue',
      'jordan@example.test',
      1,
      1,
      0,
      '[]',
      '["Center administrator"]',
    );
    store.db.prepare("INSERT INTO settings VALUES ('preview-center-users-seeded','1')").run();
  });
}
export function previewUserRows(store: PortalStore, ref: CenterRef) {
  return store.db
    .prepare('SELECT * FROM preview_center_users WHERE center_id=? AND center_type=? ORDER BY id')
    .all(ref.id, ref.type);
}
