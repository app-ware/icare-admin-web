import 'server-only';
import sql from 'mssql';
import { centerGrants } from '@/domain/access';
import { centerRefSchema, centerKey } from '@/domain/centers';
import { getStore } from '@/server/store';
import { seedDealerPreview, previewDealerDetail } from '@/server/dealers/preview';
import { getPool } from '@/server/db/pools';

export interface DealerIdentity {
  dealerId: number;
  name: string;
  username: string;
  isSuperAdmin: boolean;
  credentialStamp: string;
  ownedKeys: string[];
  reportKeys: string[];
  statusKeys: string[];
  alertKeys: string[];
}
export async function authenticateDealer(
  username: string,
  password: string,
): Promise<number | null> {
  const pool = await getPool('secure');
  const result = await pool
    .request()
    .input('userName', sql.NVarChar(450), username)
    .input('password', sql.NVarChar(450), password)
    .output('isAdmin', sql.Bit)
    .output('dealerID', sql.Int)
    .output('authenticationStatus', sql.Int)
    .execute('dbo.authenticateDealer');
  return result.output.authenticationStatus === 1 && Number(result.output.dealerID) > 0
    ? Number(result.output.dealerID)
    : null;
}
export async function loadDealer(dealerId: number): Promise<DealerIdentity | null> {
  const result = await (await getPool('secure')).request().input('dealerId', sql.Int, dealerId)
    .query(`
    SELECT dealer_id,dealer_name,username,is_super_admin,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),user_password)+CONVERT(varbinary(16),password_salt)),2) AS credential_stamp
    FROM dbo.Dealers account WHERE dealer_id=@dealerId AND is_active=1
      AND NOT EXISTS(SELECT 1 FROM dbo.Dealers duplicate WHERE duplicate.username=account.username AND duplicate.is_active=1 AND duplicate.dealer_id<>account.dealer_id);
    SELECT DISTINCT center_id,center_type FROM dbo.Dealer_Centers WHERE dealer_id=@dealerId;
    SELECT DISTINCT center_id,center_type FROM dbo.Dealer_Page_Center_Access WHERE dealer_id=@dealerId AND page_id=7 AND center_type IN(1,3);
    SELECT DISTINCT center_id,center_type FROM dbo.Dealer_Page_Center_Access WHERE dealer_id=@dealerId AND page_id=9;
    SELECT DISTINCT center_id,center_type FROM dbo.Dealer_Page_Center_Access WHERE dealer_id=@dealerId AND page_id=8;`);
  const rows = result.recordsets as unknown as Record<string, unknown>[][];
  const row = rows[0]?.[0];
  if (!row || !row.credential_stamp) return null;
  const ownedKeys = rows[1].flatMap((link) => {
    const ref = centerRefSchema.safeParse({ id: link.center_id, type: link.center_type });
    return ref.success ? [centerKey(ref.data)] : [];
  });
  return {
    dealerId: Number(row.dealer_id),
    name: String(row.dealer_name || 'iCare operator'),
    username: String(row.username),
    isSuperAdmin: row.is_super_admin === true,
    credentialStamp: String(row.credential_stamp),
    ownedKeys,
    alertKeys: rows[4].flatMap((link) => {
      const ref = centerRefSchema.safeParse({ id: link.center_id, type: link.center_type });
      return ref.success ? [centerKey(ref.data)] : [];
    }),
    statusKeys: rows[3].flatMap((link) => {
      const ref = centerRefSchema.safeParse({ id: link.center_id, type: link.center_type });
      return ref.success ? [centerKey(ref.data)] : [];
    }),
    reportKeys: rows[2].flatMap((link) => {
      const ref = centerRefSchema.safeParse({ id: link.center_id, type: link.center_type });
      return ref.success ? [centerKey(ref.data)] : [];
    }),
  };
}
export function demoDealer(dealerId: number): DealerIdentity | null {
  const store = getStore();
  seedDealerPreview(store);
  const dealer = previewDealerDetail(store, dealerId);
  if (!dealer?.active) return null;
  return {
    dealerId,
    name: dealer.name,
    username: dealer.username,
    isSuperAdmin: dealer.isSuperAdmin,
    credentialStamp: 'isolated-preview-v1',
    ownedKeys: dealer.centers.map(centerKey),
    alertKeys: store.db
      .prepare('SELECT center_id,center_type FROM preview_alert_grants WHERE dealer_id=?')
      .all(dealerId)
      .map((r) => `${r.center_id}_${r.center_type}`),
    statusKeys: store.db
      .prepare('SELECT center_id,center_type FROM preview_status_grants WHERE dealer_id=?')
      .all(dealerId)
      .map((r) => `${r.center_id}_${r.center_type}`),
    reportKeys: store.db
      .prepare('SELECT center_id,center_type FROM preview_report_grants WHERE dealer_id=?')
      .all(dealerId)
      .map((r) => `${r.center_id}_${r.center_type}`),
  };
}
export { centerGrants };
