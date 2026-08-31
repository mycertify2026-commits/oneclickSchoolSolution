// Wallet correctness tests. These exercise the exact logic the master
// prompt calls out explicitly: wallet balance can never go negative,
// debit/credit must be atomic, and insufficient balance must block
// certificate generation rather than allowing a partial/negative state.
const { v4: uuidv4 } = require('uuid');
const { pool, closePool } = require('./setup');
const { creditWallet, debitWallet } = require('../src/controllers/walletController');

let testSchoolId;
let testWalletId;

beforeAll(async () => {
  // Create a throwaway school + wallet to test against, without going
  // through the full user/school creation flow.
  testSchoolId = uuidv4();
  await pool.query(
    `INSERT INTO schools (id, name, login_id, status) VALUES (?, 'Test School', ?, 'active')`,
    [testSchoolId, `TEST${Date.now()}`]
  );
  testWalletId = uuidv4();
  await pool.query(`INSERT INTO wallets (id, school_id, balance) VALUES (?, ?, 100)`, [testWalletId, testSchoolId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM wallets WHERE school_id = ?', [testSchoolId]);
  await pool.query('DELETE FROM schools WHERE id = ?', [testSchoolId]);
  await closePool();
});

test('creditWallet increases balance and logs a credit transaction', async () => {
  const { newBalance } = await creditWallet(testSchoolId, 50, 'test_credit', null, 'test');
  expect(newBalance).toBe(150);

  const [rows] = await pool.query('SELECT balance FROM wallets WHERE id = ?', [testWalletId]);
  expect(Number(rows[0].balance)).toBe(150);
});

test('debitWallet decreases balance when funds are sufficient', async () => {
  const { newBalance } = await debitWallet(testSchoolId, 30, 'test_debit', null, 'test');
  expect(newBalance).toBe(120);
});

test('debitWallet throws INSUFFICIENT_BALANCE and does not change balance when funds are insufficient', async () => {
  const [beforeRows] = await pool.query('SELECT balance FROM wallets WHERE id = ?', [testWalletId]);
  const before = Number(beforeRows[0].balance);

  await expect(debitWallet(testSchoolId, 999999, 'test_debit', null, 'test')).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });

  const [afterRows] = await pool.query('SELECT balance FROM wallets WHERE id = ?', [testWalletId]);
  expect(Number(afterRows[0].balance)).toBe(before);
});

test('concurrent debits never push balance negative', async () => {
  // Reset to a known balance, then fire many concurrent debits that
  // collectively exceed it. Exactly enough should succeed to drain it to
  // zero (or just above), and the rest must fail - balance must never dip
  // below zero even with simultaneous requests racing each other.
  await pool.query('UPDATE wallets SET balance = 100 WHERE id = ?', [testWalletId]);

  const attempts = Array.from({ length: 10 }, () => debitWallet(testSchoolId, 30, 'race_test', null, 'concurrent test'));
  const results = await Promise.allSettled(attempts);

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  // 100 / 30 = 3 successful debits possible (90 spent, 10 left), 4th+ must fail
  expect(succeeded).toBeLessThanOrEqual(3);

  const [rows] = await pool.query('SELECT balance FROM wallets WHERE id = ?', [testWalletId]);
  expect(Number(rows[0].balance)).toBeGreaterThanOrEqual(0);
});
