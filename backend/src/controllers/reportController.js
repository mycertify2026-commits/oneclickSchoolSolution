const { pool, monthExpr } = require('../config/db');

// Date N months before now (portable across PG/MySQL — computed in JS)
function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}
const { sendExport } = require('../utils/importExport');

// GET /api/reports/overview (superAdmin) - top-line platform numbers
async function getOverview(req, res) {
  try {
    const [[schoolStats]] = await pool.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
              SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
              SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) as suspended
       FROM schools`
    );
    const [[studentStats]] = await pool.query('SELECT COUNT(*) as total FROM students');
    const [[certStats]] = await pool.query('SELECT COUNT(*) as total, COALESCE(SUM(price),0) as revenue, COALESCE(SUM(gst_amount),0) as gst FROM certificates');
    const [[walletStats]] = await pool.query('SELECT COALESCE(SUM(balance),0) as total_balance FROM wallets');
    const [[distStats]] = await pool.query('SELECT COUNT(*) as total FROM distributors');

    // Platform / Super Admin earnings come from the commission ledger — the
    // permanent per-transaction snapshot, never recalculated from today's
    // percentages. Only 'confirmed' rows (a failed/cancelled certificate
    // never gets a ledger row in the first place).
    const [[earnings]] = await pool.query(
      `SELECT COALESCE(SUM(platform_share),0) as platform_total,
              COALESCE(SUM(super_admin_amount),0) as super_admin_total,
              COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE() THEN super_admin_amount ELSE 0 END),0) as super_admin_today,
              COALESCE(SUM(CASE WHEN YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE()) THEN super_admin_amount ELSE 0 END),0) as super_admin_month,
              COUNT(*) as total_transactions
       FROM commission_ledger WHERE status='confirmed'`
    );
    const [byType] = await pool.query(
      `SELECT certificate_type, COALESCE(SUM(super_admin_amount),0) as super_admin_total, COUNT(*) as count
       FROM commission_ledger WHERE status='confirmed' GROUP BY certificate_type`
    );
    const [byDistributor] = await pool.query(
      `SELECT d.id as distributor_id, u.name as distributor_name,
              COALESCE(SUM(cl.distributor_amount),0) as distributor_total
       FROM commission_ledger cl
       JOIN distributors d ON d.id = cl.distributor_id
       JOIN users u ON u.id = d.user_id
       WHERE cl.status='confirmed' GROUP BY d.id, u.name ORDER BY distributor_total DESC LIMIT 10`
    );
    // Monthly trend of Super Admin's own share, for the commission chart —
    // reuses the same commission_ledger snapshot as the totals above.
    const [superAdminByMonth] = await pool.query(
      `SELECT ${monthExpr('created_at')} as month, COALESCE(SUM(super_admin_amount),0) as total, COUNT(*) as count
       FROM commission_ledger WHERE status='confirmed' AND created_at >= ?
       GROUP BY month ORDER BY month ASC`,
      [monthsAgo(6)]
    );

    res.json({
      schools: { total: schoolStats.total, active: schoolStats.active, pending: schoolStats.pending, rejected: schoolStats.rejected, suspended: schoolStats.suspended },
      students: { total: studentStats.total },
      certificates: { total: certStats.total, revenue: Number(certStats.revenue), gst: Number(certStats.gst) },
      wallets: { totalBalance: Number(walletStats.total_balance) },
      distributors: { total: distStats.total },
      earnings: {
        platformTotal: Number(earnings.platform_total),
        superAdminTotal: Number(earnings.super_admin_total),
        superAdminToday: Number(earnings.super_admin_today),
        superAdminMonth: Number(earnings.super_admin_month),
        totalTransactions: Number(earnings.total_transactions),
        byCertificateType: byType.map(r => ({ type: r.certificate_type, superAdminTotal: Number(r.super_admin_total), count: Number(r.count) })),
        byDistributor: byDistributor.map(r => ({ distributorId: r.distributor_id, name: r.distributor_name, distributorTotal: Number(r.distributor_total) })),
        byMonth: superAdminByMonth.map(r => ({ month: r.month, total: Number(r.total), count: Number(r.count) })),
      },
    });
  } catch (err) {
    console.error('getOverview error:', err.message);
    res.status(500).json({ error: 'Server error generating overview report' });
  }
}

// GET /api/reports/revenue?months=6 - monthly revenue + GST trend across the whole platform
async function getRevenueTrend(req, res) {
  try {
    const months = Math.min(24, parseInt(req.query.months) || 6);
    const [rows] = await pool.query(
      `SELECT ${monthExpr('created_at')} as month, COUNT(*) as certificate_count, COALESCE(SUM(price),0) as revenue, COALESCE(SUM(gst_amount),0) as gst
       FROM certificates
       WHERE created_at >= ?
       GROUP BY month ORDER BY month ASC`,
      [monthsAgo(months)]
    );
    res.json({ trend: rows.map(r => ({ month: r.month, certificateCount: Number(r.certificate_count), revenue: Number(r.revenue), gst: Number(r.gst) })) });
  } catch (err) {
    console.error('getRevenueTrend error:', err.message);
    res.status(500).json({ error: 'Server error generating revenue report' });
  }
}

// GET /api/reports/certificates-by-type - breakdown for the dashboard's certificate-usage chart
async function getCertificatesByType(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT type, COUNT(*) as count, COALESCE(SUM(price),0) as revenue FROM certificates GROUP BY type`
    );
    res.json({ breakdown: rows.map(r => ({ type: r.type, count: Number(r.count), revenue: Number(r.revenue) })) });
  } catch (err) {
    console.error('getCertificatesByType error:', err.message);
    res.status(500).json({ error: 'Server error generating certificate type report' });
  }
}

// GET /api/reports/top-schools?limit=10 - schools ranked by certificate revenue
async function getTopSchools(req, res) {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.city, s.district, COUNT(c.id) as certificate_count, COALESCE(SUM(c.price),0) as revenue
       FROM schools s LEFT JOIN certificates c ON c.school_id = s.id
       GROUP BY s.id, s.name, s.city, s.district
       ORDER BY revenue DESC LIMIT ?`,
      [limit]
    );
    res.json({ schools: rows.map(r => ({ id: r.id, name: r.name, city: r.city, district: r.district, certificateCount: Number(r.certificate_count), revenue: Number(r.revenue) })) });
  } catch (err) {
    console.error('getTopSchools error:', err.message);
    res.status(500).json({ error: 'Server error generating top schools report' });
  }
}

// GET /api/reports/distributor-performance - all distributors ranked by school count and revenue generated
async function getDistributorPerformance(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, u.name, d.commission_rate,
        COUNT(DISTINCT s.id) as school_count,
        COALESCE(SUM(c.price), 0) as total_revenue
       FROM distributors d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN schools s ON s.distributor_id = d.id
       LEFT JOIN certificates c ON c.school_id = s.id
       WHERE u.role = 'distributor'
       GROUP BY d.id, u.name, d.commission_rate
       ORDER BY total_revenue DESC`
    );
    res.json({
      distributors: rows.map(r => ({
        id: r.id, name: r.name, commissionRate: Number(r.commission_rate),
        schoolCount: Number(r.school_count), totalRevenue: Number(r.total_revenue),
        estimatedCommission: Math.round(Number(r.total_revenue) * (Number(r.commission_rate) / 100) * 100) / 100
      }))
    });
  } catch (err) {
    console.error('getDistributorPerformance error:', err.message);
    res.status(500).json({ error: 'Server error generating distributor performance report' });
  }
}

const USER_EXPORT_COLUMNS = [
  { header: 'Name', field: 'name' },
  { header: 'Email', field: 'email' },
  { header: 'Mobile', field: 'mobile' },
  { header: 'Role', field: 'role' },
  { header: 'Active', field: 'is_active', type: 'boolean' },
  { header: 'Password Set', field: 'password_set', type: 'boolean' },
  { header: 'Created Date', field: 'created_at', type: 'date' }
];

// GET /api/reports/export-users?format=excel|csv&role=schoolAdmin
async function exportUsers(req, res) {
  try {
    const { format, role } = req.query;
    let query = 'SELECT name, email, mobile, role, is_active, password_set, created_at FROM users WHERE deleted_at IS NULL';
    const params = [];
    if (role) { query += ' AND role = ?'; params.push(role); }
    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(query, params);
    sendExport(res, { rows, columns: USER_EXPORT_COLUMNS, filename: `users-export-${Date.now()}`, format });
  } catch (err) {
    console.error('exportUsers error:', err.message);
    res.status(500).json({ error: 'Server error exporting users' });
  }
}

module.exports = { getOverview, getRevenueTrend, getCertificatesByType, getTopSchools, getDistributorPerformance, exportUsers };
