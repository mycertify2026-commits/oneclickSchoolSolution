const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { sendExport } = require('../utils/importExport');

// GET /api/wallet/balance
async function getBalance(req, res) {
  try {
    const [rows] = await pool.query('SELECT balance FROM wallets WHERE school_id = ?', [req.schoolId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Wallet not found for this school' });
    res.json({ balance: Number(rows[0].balance) });
  } catch (err) {
    console.error('getBalance error:', err.message);
    res.status(500).json({ error: 'Server error fetching balance' });
  }
}

// GET /api/wallet/transactions
async function getTransactions(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [walletRows] = await pool.query('SELECT id FROM wallets WHERE school_id = ?', [req.schoolId]);
    if (walletRows.length === 0) return res.status(404).json({ error: 'Wallet not found' });
    const walletId = walletRows[0].id;

    const [rows] = await pool.query(
      `SELECT id, type, amount, balance_after, reason, description, created_at
       FROM wallet_transactions WHERE wallet_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [walletId, limit, offset]
    );
    const [countRows] = await pool.query('SELECT COUNT(*) as count FROM wallet_transactions WHERE wallet_id = ?', [walletId]);

    // Opening balance for each row, derived from its own closing balance and
    // amount/type - lets the ledger UI show Opening | Credit | Debit |
    // Closing per row without a second query, satisfying the full-ledger
    // requirement (Part 7: Opening Balance, Credit, Debit, Closing Balance).
    const ledgerRows = rows.map(r => ({
      ...r,
      opening_balance: r.type === 'credit'
        ? Number(r.balance_after) - Number(r.amount)
        : Number(r.balance_after) + Number(r.amount)
    }));

    res.json({ transactions: ledgerRows, total: countRows[0].count, page, limit });
  } catch (err) {
    console.error('getTransactions error:', err.message);
    res.status(500).json({ error: 'Server error fetching transactions' });
  }
}

// Internal: credits a wallet atomically using SELECT ... FOR UPDATE row locking,
// so two concurrent top-ups can never read a stale balance and clobber each other.
async function creditWallet(schoolId, amount, reason, referenceId, description) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [walletRows] = await conn.query('SELECT id, balance FROM wallets WHERE school_id = ? FOR UPDATE', [schoolId]);
    if (walletRows.length === 0) throw new Error('Wallet not found for school');
    const wallet = walletRows[0];
    const newBalance = Number(wallet.balance) + Number(amount);

    await conn.query('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, wallet.id]);

    const txId = uuidv4();
    await conn.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, balance_after, reason, reference_id, description)
       VALUES (?, ?, 'credit', ?, ?, ?, ?, ?)`,
      [txId, wallet.id, amount, newBalance, reason, referenceId, description]
    );

    await conn.commit();
    return { newBalance, transactionId: txId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Internal: debits a wallet atomically. Throws INSUFFICIENT_BALANCE if not enough funds.
// The row lock + balance check inside the same transaction means the balance
// can never go negative even under concurrent certificate-generation requests.
async function debitWallet(schoolId, amount, reason, referenceId, description) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [walletRows] = await conn.query('SELECT id, balance FROM wallets WHERE school_id = ? FOR UPDATE', [schoolId]);
    if (walletRows.length === 0) throw new Error('Wallet not found for school');
    const wallet = walletRows[0];
    const currentBalance = Number(wallet.balance);

    if (currentBalance < Number(amount)) {
      await conn.rollback();
      const err = new Error('INSUFFICIENT_BALANCE');
      err.code = 'INSUFFICIENT_BALANCE';
      err.currentBalance = currentBalance;
      throw err;
    }

    const newBalance = currentBalance - Number(amount);
    await conn.query('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, wallet.id]);

    const txId = uuidv4();
    await conn.query(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, balance_after, reason, reference_id, description)
       VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)`,
      [txId, wallet.id, amount, newBalance, reason, referenceId, description]
    );

    await conn.commit();
    return { newBalance, transactionId: txId };
  } catch (err) {
    if (err.code !== 'INSUFFICIENT_BALANCE') {
      try { await conn.rollback(); } catch (e) {}
    }
    throw err;
  } finally {
    conn.release();
  }
}

const WALLET_TX_EXPORT_COLUMNS = [
  { header: 'Date', field: 'created_at', type: 'datetime' },
  { header: 'Type', field: 'type' },
  { header: 'Description', field: 'description' },
  { header: 'Amount', field: 'amount', type: 'currency' },
  { header: 'Balance After', field: 'balance_after', type: 'currency' },
  { header: 'Reason', field: 'reason' }
];

// GET /api/wallet/transactions/export?format=excel|csv&dateFrom=...&dateTo=...
async function exportTransactions(req, res) {
  try {
    const { format, dateFrom, dateTo } = req.query;
    const [walletRows] = await pool.query('SELECT id FROM wallets WHERE school_id = ?', [req.schoolId]);
    if (walletRows.length === 0) return res.status(404).json({ error: 'Wallet not found' });

    let query = 'SELECT * FROM wallet_transactions WHERE wallet_id = ?';
    const params = [walletRows[0].id];
    if (dateFrom) { query += ' AND created_at >= ?'; params.push(dateFrom); }
    if (dateTo) { query += ' AND created_at <= ?'; params.push(dateTo); }
    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(query, params);
    sendExport(res, { rows, columns: WALLET_TX_EXPORT_COLUMNS, filename: `wallet-transactions-${Date.now()}`, format });
  } catch (err) {
    console.error('exportTransactions error:', err.message);
    res.status(500).json({ error: 'Server error exporting transactions' });
  }
}

module.exports = { getBalance, getTransactions, creditWallet, debitWallet, exportTransactions };
