// Single source of truth for splitting a certificate's price into
// School / Super Admin / Super Distributor / Distributor shares, and for
// recording that split permanently once a certificate is successfully
// issued. The backend is the only place this math happens — the frontend
// must never be trusted to compute or submit any of these amounts.
const { pool } = require('../config/db');

async function getActiveConfig() {
  const [rows] = await pool.query('SELECT * FROM commission_config ORDER BY updated_at DESC LIMIT 1');
  if (!rows.length) throw new Error('Commission configuration is missing');
  return rows[0];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Resolves the distributor/super-distributor chain for a school, the same
// way the existing hard-copy-request and super-distributor code already
// does (schools.super_distributor_id, falling back to the distributor's
// own super_distributor_id).
async function resolveHierarchy(school) {
  let distributorId = school.distributor_id || null;
  let superDistributorId = school.super_distributor_id || null;
  if (distributorId && !superDistributorId) {
    const [rows] = await pool.query('SELECT super_distributor_id FROM distributors WHERE id = ?', [distributorId]);
    superDistributorId = rows[0]?.super_distributor_id || null;
  }
  return { distributorId, superDistributorId };
}

// Computes and permanently stores the commission split for one certificate.
// Called once, right after a certificate row is successfully inserted —
// never before, so a failed/cancelled certificate never gets a ledger row.
// Idempotent on certificate_id (UNIQUE key) so a retry can't double-record.
async function recordCommission({ certificateId, certificateType, certificatePrice, school }) {
  const cfg = await getActiveConfig();
  const { distributorId, superDistributorId } = await resolveHierarchy(school);

  const price = Number(certificatePrice);
  const schoolShare = round2(price * Number(cfg.school_pct) / 100);
  const platformShare = round2(price - schoolShare); // avoids rounding leftovers vs price*platform_pct/100

  const superAdminAmount = round2(platformShare * Number(cfg.super_admin_pct) / 100);
  const superDistributorAmount = round2(platformShare * Number(cfg.super_distributor_pct) / 100);
  const distributorAmount = round2(platformShare * Number(cfg.distributor_pct) / 100);

  try {
    await pool.query(
      `INSERT INTO commission_ledger
       (id, certificate_id, school_id, distributor_id, super_distributor_id, certificate_type,
        certificate_price, school_pct, school_share, platform_pct, platform_share,
        super_admin_pct, super_admin_amount, super_distributor_pct, super_distributor_amount,
        distributor_pct, distributor_amount, status)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
      [certificateId, school.id, distributorId, superDistributorId, certificateType,
       price, cfg.school_pct, schoolShare, cfg.platform_pct, platformShare,
       cfg.super_admin_pct, superAdminAmount, cfg.super_distributor_pct, superDistributorAmount,
       cfg.distributor_pct, distributorAmount]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return; // already recorded for this certificate — not an error
    throw e;
  }
}

module.exports = { getActiveConfig, recordCommission };
