// One-time, idempotent, safe-to-re-run backfill for certificates issued
// before the UUID() production bug in commission.js was fixed — those
// certificates were correctly charged and issued, but commission_ledger
// INSERTs were silently failing (Postgres has no UUID() function), so they
// never got a ledger row. Every dashboard sums commission strictly from
// commission_ledger, so distributors/super distributors/super admin would
// see the certificate's revenue but ₹0 commission for it.
//
// This fills in the missing rows using each certificate's school's CURRENT
// distributor/super-distributor assignment and the commission config active
// at backfill time — the best available approximation, since no historical
// snapshot of either exists. Certificates that already have a ledger row
// (the normal case, post-fix) are left untouched.
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./db');
const { getActiveConfig, resolveHierarchy, computeSplit } = require('../utils/commission');

async function backfill() {
  const cfg = await getActiveConfig();

  const [certs] = await pool.query(
    `SELECT c.id, c.type, c.price, c.school_id, s.distributor_id, s.super_distributor_id
     FROM certificates c
     JOIN schools s ON s.id = c.school_id
     LEFT JOIN commission_ledger cl ON cl.certificate_id = c.id
     WHERE cl.id IS NULL AND c.deleted_at IS NULL`
  );

  console.log(`Found ${certs.length} certificate(s) with no commission_ledger row.`);
  let inserted = 0;
  let skipped = 0;

  for (const cert of certs) {
    const { distributorId, superDistributorId } = await resolveHierarchy({
      distributor_id: cert.distributor_id,
      super_distributor_id: cert.super_distributor_id,
    });
    const price = Number(cert.price);
    const split = computeSplit(price, cfg, distributorId, superDistributorId);

    try {
      await pool.query(
        `INSERT INTO commission_ledger
         (id, certificate_id, school_id, distributor_id, super_distributor_id, certificate_type,
          certificate_price, school_pct, school_share, platform_pct, platform_share,
          super_admin_pct, super_admin_amount, super_distributor_pct, super_distributor_amount,
          distributor_pct, distributor_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
        [uuidv4(), cert.id, cert.school_id, distributorId, superDistributorId, cert.type,
         price, cfg.school_pct, split.schoolShare, cfg.platform_pct, split.platformShare,
         cfg.super_admin_pct, split.superAdminAmount, cfg.super_distributor_pct, split.superDistributorAmount,
         cfg.distributor_pct, split.distributorAmount]
      );
      inserted += 1;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' || e.code === '23505') { skipped += 1; continue; }
      throw e;
    }
  }

  console.log(`Backfill complete: ${inserted} inserted, ${skipped} skipped (already existed).`);
}

backfill()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
