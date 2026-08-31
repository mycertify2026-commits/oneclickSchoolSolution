// Integration tests for the auth flow and role-based access control.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const app = require('../src/server');
const { pool, closePool } = require('./setup');

let testUserId;
const testEmail = `test-${Date.now()}@certifypro.test`;
const testPassword = 'TestPass@123';

beforeAll(async () => {
  testUserId = uuidv4();
  const hash = await bcrypt.hash(testPassword, 10);
  await pool.query(
    `INSERT INTO users (id, role, name, email, password_hash, is_active, password_set) VALUES (?, 'superAdmin', 'Test Admin', ?, ?, 1, 1)`,
    [testUserId, testEmail, hash]
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);
  await closePool();
});

describe('POST /api/auth/login', () => {
  test('succeeds with correct credentials and returns tokens', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.role).toBe('superAdmin');
  });

  test('fails with wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: testEmail, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('fails with non-existent email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@nowhere.test', password: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('Role-based access control', () => {
  test('rejects access to a Super-Admin-only route without a token', async () => {
    const res = await request(app).get('/api/schools');
    expect(res.status).toBe(401);
  });

  test('rejects access to a Super-Admin-only route with a schoolAdmin token', async () => {
    // Sign a token directly for a role that should be rejected, to test
    // the requireRole middleware in isolation.
    const { signAccessToken } = require('../src/utils/jwt');
    const fakeSchoolAdminId = uuidv4();
    await pool.query(
      `INSERT INTO users (id, role, name, email, is_active, password_set) VALUES (?, 'schoolAdmin', 'Fake School Admin', ?, 1, 1)`,
      [fakeSchoolAdminId, `fake-${Date.now()}@test.com`]
    );
    const token = signAccessToken({ id: fakeSchoolAdminId, role: 'schoolAdmin' });

    const res = await request(app).get('/api/schools').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);

    await pool.query('DELETE FROM users WHERE id = ?', [fakeSchoolAdminId]);
  });

  test('allows access to a Super-Admin-only route with a valid superAdmin token', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email: testEmail, password: testPassword });
    const res = await request(app).get('/api/schools').set('Authorization', `Bearer ${loginRes.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.schools)).toBe(true);
  });
});
