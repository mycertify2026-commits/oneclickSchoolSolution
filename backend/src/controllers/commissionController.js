const { pool } = require('../config/db');
const { getActiveConfig } = require('../utils/commission');

// GET /api/commission/config (superAdmin)
async function getConfig(req, res) {
  try {
    const cfg = await getActiveConfig();
    res.json({ config: cfg });
  } catch (err) {
    console.error('getConfig error:', err.message);
    res.status(500).json({ error: 'Server error fetching commission configuration' });
  }
}

// PUT /api/commission/config (superAdmin)
// Two independent splits, each must sum to exactly 100:
//   school_pct + platform_pct == 100
//   super_admin_pct + super_distributor_pct + distributor_pct == 100
async function updateConfig(req, res) {
  try {
    const current = await getActiveConfig();
    const school_pct = req.body.school_pct !== undefined ? Number(req.body.school_pct) : Number(current.school_pct);
    const platform_pct = req.body.platform_pct !== undefined ? Number(req.body.platform_pct) : Number(current.platform_pct);
    const super_admin_pct = req.body.super_admin_pct !== undefined ? Number(req.body.super_admin_pct) : Number(current.super_admin_pct);
    const super_distributor_pct = req.body.super_distributor_pct !== undefined ? Number(req.body.super_distributor_pct) : Number(current.super_distributor_pct);
    const distributor_pct = req.body.distributor_pct !== undefined ? Number(req.body.distributor_pct) : Number(current.distributor_pct);

    for (const [name, v] of Object.entries({ school_pct, platform_pct, super_admin_pct, super_distributor_pct, distributor_pct })) {
      if (isNaN(v) || v < 0 || v > 100) return res.status(400).json({ error: `Invalid percentage for ${name}` });
    }
    if (Math.abs(school_pct + platform_pct - 100) > 0.01) {
      return res.status(400).json({ error: 'school_pct + platform_pct must equal 100' });
    }
    if (Math.abs(super_admin_pct + super_distributor_pct + distributor_pct - 100) > 0.01) {
      return res.status(400).json({ error: 'super_admin_pct + super_distributor_pct + distributor_pct must equal 100' });
    }

    await pool.query(
      `UPDATE commission_config SET
        school_pct = ?, platform_pct = ?, super_admin_pct = ?, super_distributor_pct = ?, distributor_pct = ?,
        updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [school_pct, platform_pct, super_admin_pct, super_distributor_pct, distributor_pct, req.user.id, current.id]
    );
    const cfg = await getActiveConfig();
    res.json({ config: cfg });
  } catch (err) {
    console.error('updateConfig error:', err.message);
    res.status(500).json({ error: 'Server error updating commission configuration' });
  }
}

module.exports = { getConfig, updateConfig };
