// Route and middleware tests that need no real MongoDB: the collections the
// routes use are replaced with small in-memory fakes.
process.env.JWT_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { dbState } = require('../src/db/connection');
const authRoutes = require('../src/routes/auth');
const studentsRoutes = require('../src/routes/students');
const analyticsRoutes = require('../src/routes/analytics');
const { securityHeaders } = require('../src/middleware/security');
const { createRateLimiter } = require('../src/middleware/rateLimiter');
const { isValidObjectId } = require('../src/utils/validators');

function startApp(...mounts) {
  const app = express();
  app.use(express.json());
  app.use(securityHeaders);
  mounts.forEach((mount) => app.use(mount));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const goodToken = () => jwt.sign({ userId: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET);

test('isValidObjectId accepts only 24-character hex strings', () => {
  assert.equal(isValidObjectId('507f1f77bcf86cd799439011'), true);
  assert.equal(isValidObjectId('not-an-id'), false);
  assert.equal(isValidObjectId('123456789012'), false);
  assert.equal(isValidObjectId(undefined), false);
});

test('the old demo passwords no longer log anyone in', async () => {
  const passwordHash = await bcrypt.hash('SomethingElse123', 4);
  dbState.usersCol = {
    findOne: async () => ({
      _id: 'u1', email: 'demo.teacher@saps.local', emailKey: 'demo.teacher@saps.local', passwordHash, role: 'teacher',
    }),
  };
  const { server, url } = await startApp(authRoutes);
  try {
    for (const password of ['Demo@123', 'Demo@1234']) {
      const res = await post(`${url}/api/login`, { email: 'demo.teacher@saps.local', password });
      assert.equal(res.status, 401, `${password} must be rejected`);
    }
    const ok = await post(`${url}/api/login`, { email: 'demo.teacher@saps.local', password: 'SomethingElse123' });
    assert.equal(ok.status, 200);
  } finally {
    server.close();
  }
});

test('login and signup reject non-string credentials with 400', async () => {
  const { server, url } = await startApp(authRoutes);
  try {
    const login = await post(`${url}/api/login`, { email: { $ne: '' }, password: { $ne: '' } });
    assert.equal(login.status, 400);
    const signup = await post(`${url}/api/signup`, {
      fullName: 'A', email: 'a@b.co', password: ['x'], confirmPassword: ['x'],
    });
    assert.equal(signup.status, 400);
  } finally {
    server.close();
  }
});

test('signup enforces an 8 character minimum password', async () => {
  const { server, url } = await startApp(authRoutes);
  try {
    const res = await post(`${url}/api/signup`, {
      fullName: 'A', email: 'a@b.co', password: 'short12', confirmPassword: 'short12',
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /at least 8/);
  } finally {
    server.close();
  }
});

test('malformed upload ids get a 400 instead of a 500', async () => {
  const { server, url } = await startApp(studentsRoutes, analyticsRoutes);
  const headers = { Authorization: `Bearer ${goodToken()}` };
  try {
    for (const path of ['/api/students/nope', '/api/analytics/nope', '/api/analytics/nope/filtered']) {
      const res = await fetch(url + path, { headers });
      assert.equal(res.status, 400, path);
    }
  } finally {
    server.close();
  }
});

test('the student search is matched as plain text, not a regex', async () => {
  let filter;
  dbState.studentsCol = {
    countDocuments: async (f) => { filter = f; return 0; },
    find: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ toArray: async () => [] }) }) }) }),
  };
  const { server, url } = await startApp(studentsRoutes);
  try {
    const res = await fetch(`${url}/api/students/507f1f77bcf86cd799439011?search=${encodeURIComponent('(a+)+$[')}`, {
      headers: { Authorization: `Bearer ${goodToken()}` },
    });
    assert.equal(res.status, 200);
    assert.equal(filter.$or[0].rollNo.source, '\\(a\\+\\)\\+\\$\\[');
  } finally {
    server.close();
  }
});

test('responses carry a Content-Security-Policy', async () => {
  const { server, url } = await startApp(express.Router().get('/ping', (req, res) => res.send('ok')));
  try {
    const res = await fetch(`${url}/ping`);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  } finally {
    server.close();
  }
});

test('the rate limiter ignores a spoofed X-Forwarded-For header', async () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 2, message: 'slow down' });
  const app = express();
  app.get('/x', limiter, (req, res) => res.send('ok'));
  const { server, url } = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve({ server: s, url: `http://127.0.0.1:${s.address().port}` }));
  });
  try {
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await fetch(`${url}/x`, { headers: { 'X-Forwarded-For': `10.0.0.${i}` } });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses, [200, 200, 429, 429]);
  } finally {
    server.close();
  }
});
