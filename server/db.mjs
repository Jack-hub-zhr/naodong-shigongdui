// Minimal account store. Sessions are hashed; passwords use scrypt.
// Render has no persistent disk on the free plan, so DATA_DIR can be pointed
// at an attached disk when one is available.

import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const DATA_FILE = process.env.DATA_FILE?.trim()
  || resolve(process.cwd(), 'data', 'accounts.json');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_STATE_BYTES = 3 * 1024 * 1024;

// 每次发布改动递增 ACCOUNT_EPOCH，启动时清理旧用户。Jack 的账号、项目和会话永远保留。
const ACCOUNT_EPOCH = (process.env.RENDER_GIT_COMMIT || '20261126i').slice(0, 12);
const db = { users: [], sessions: [], states: {}, meta: {} };
let writeQueue = Promise.resolve();

function load() {
  try {
    if (!existsSync(DATA_FILE)) return;
    const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    db.users = Array.isArray(parsed.users) ? parsed.users : [];
    db.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    db.states = parsed.states && typeof parsed.states === 'object' ? parsed.states : {};
    db.meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
  } catch (error) {
    console.error('账号数据读取失败，使用空库', error?.message || error);
  }
}

function persist() {
  writeQueue = writeQueue.then(async () => {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db));
    renameSync(tmp, DATA_FILE);
  }).catch((error) => {
    console.error('账号数据写入失败', error?.message || error);
  });
  return writeQueue;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validUsername(value) {
  return /^[\w\u4e00-\u9fa5.-]{2,24}$/.test(String(value || '').trim());
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, username: user.username || user.name, createdAt: user.createdAt };
}

function usernameTaken(candidate, exceptId) {
  const key = normalizeUsername(candidate);
  return db.users.some((u) => u.id !== exceptId
    && (normalizeUsername(u.username) === key || normalizeUsername(u.name) === key));
}

function uniqueUsername(base, exceptId) {
  let candidate = normalizeUsername(base) || 'user';
  let n = 2;
  while (usernameTaken(candidate, exceptId)) {
    candidate = `${normalizeUsername(base) || 'user'}${n}`;
    n += 1;
  }
  return candidate;
}

function cleanupSessions() {
  const now = Date.now();
  const live = db.sessions.filter((s) => s.expiresAt > now);
  if (live.length !== db.sessions.length) {
    db.sessions = live;
    persist();
  }
}

function findOwner() {
  const byId = String(process.env.JACK_USER_ID || '').trim();
  const byEmail = normalizeEmail(process.env.JACK_EMAIL || '');
  const byUsername = normalizeUsername(process.env.JACK_USERNAME || '');
  const explicit = db.users.filter((u) => (byId && u.id === byId)
    || (byEmail && u.email === byEmail)
    || (byUsername && (normalizeUsername(u.username) === byUsername || normalizeUsername(u.name) === byUsername)));
  if (explicit.length) return explicit[0];
  const hinted = db.users.filter((u) => /jack|曾浩然|zhr/i.test(`${u.name || ''} ${u.username || ''} ${u.email || ''}`));
  if (hinted.length) return hinted[0];
  // 只有一个账号时它必然是站主本人；多账号且无法识别 Jack 时宁可不清理，也不冒险删错。
  if (db.users.length === 1) return db.users[0];
  return null;
}

function jackIds() {
  const owner = findOwner();
  return owner ? new Set([owner.id]) : new Set();
}

async function normalizeAccounts() {
  const used = new Set();
  let changed = false;
  for (const user of db.users) {
    const base = normalizeUsername(user.username || user.name || String(user.email || '').split('@')[0]);
    let candidate = base && validUsername(base) ? base : 'user';
    let n = 2;
    while (used.has(candidate)) { candidate = `${base || 'user'}${n}`; n += 1; }
    if (user.username !== candidate) { user.username = candidate; changed = true; }
    used.add(candidate);
  }

  const owner = findOwner();
  if (owner) {
    const email = normalizeEmail(process.env.JACK_EMAIL || '');
    const name = String(process.env.JACK_NAME || '').trim();
    const username = normalizeUsername(process.env.JACK_USERNAME || '');
    if (email && owner.email !== email) { owner.email = email; changed = true; }
    if (name && owner.name !== name) { owner.name = name; changed = true; }
    if (username && owner.username !== username) {
      owner.username = uniqueUsername(username, owner.id);
      changed = true;
    }
  }
  if (changed) await persist();
}

async function resetAccountsForEpoch() {
  if (db.meta.accountEpoch === ACCOUNT_EPOCH) return;
  const keep = jackIds();
  if (db.users.length > 0 && keep.size === 0) {
    console.error('[accounts] 未识别 Jack 账号，已跳过本次清理；可设置 JACK_EMAIL 或 JACK_USER_ID');
    return;
  }
  const removedUsers = db.users.filter((u) => !keep.has(u.id)).length;
  db.users = db.users.filter((u) => keep.has(u.id));
  db.sessions = db.sessions.filter((s) => keep.has(s.userId));
  for (const id of Object.keys(db.states)) {
    if (!keep.has(id)) delete db.states[id];
  }
  db.meta.accountEpoch = ACCOUNT_EPOCH;
  db.meta.lastResetAt = Date.now();
  await persist();
  console.log(`[accounts] 已清理 ${removedUsers} 个非 Jack 账号，保留 ${keep.size} 个账号及其项目`);
}

function seedOwnerFromEnv() {
  if (db.users.length) return;
  const raw = process.env.JACK_SEED?.trim();
  if (!raw) return;
  try {
    const seed = JSON.parse(raw);
    const user = seed?.user;
    if (!user?.id || !user?.email || !user?.salt || !user?.hash) throw new Error('JACK_SEED 账户字段不完整');
    db.users = [user];
    if (seed.state && typeof seed.state === 'object') db.states[user.id] = seed.state;
    db.sessions = [];
    console.log(`[accounts] 已从 JACK_SEED 恢复站主账号 ${user.email}`);
  } catch (error) {
    console.error('[accounts] JACK_SEED 恢复失败', error?.message || error);
  }
}

export async function initAccounts() {
  load();
  seedOwnerFromEnv();
  await normalizeAccounts();
  await resetAccountsForEpoch();
  cleanupSessions();
  return { file: DATA_FILE, users: db.users.length };
}

export function accountsInfo() {
  return {
    users: db.users.length,
    persistent: Boolean(process.env.DATA_FILE),
    epoch: ACCOUNT_EPOCH,
    lastResetAt: db.meta.lastResetAt || null,
  };
}

async function hashPassword(password, salt) {
  const derived = await scryptAsync(password, salt, 64);
  return derived.toString('hex');
}

export async function register({ email, name, username, password }) {
  const normalized = normalizeEmail(email);
  const displayName = String(username || name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 120) {
    throw Object.assign(new Error('请输入有效邮箱'), { status: 400, code: 'INVALID_EMAIL' });
  }
  if (!validUsername(displayName)) {
    throw Object.assign(new Error('用户名需为 2–24 个字符，可用中英文、数字、_ . -'), { status: 400, code: 'INVALID_USERNAME' });
  }
  if (String(password || '').length < 8 || String(password).length > 128) {
    throw Object.assign(new Error('密码至少 8 位'), { status: 400, code: 'INVALID_PASSWORD' });
  }
  if (db.users.some((u) => u.email === normalized)) {
    throw Object.assign(new Error('这个邮箱已经注册，直接登录即可'), { status: 409, code: 'EMAIL_TAKEN' });
  }
  if (usernameTaken(displayName)) {
    throw Object.assign(new Error('这个用户名已经被使用'), { status: 409, code: 'USERNAME_TAKEN' });
  }

  const salt = randomBytes(16).toString('hex');
  const hash = await hashPassword(password, salt);
  if (db.users.some((u) => u.email === normalized)) {
    throw Object.assign(new Error('这个邮箱已经注册，直接登录即可'), { status: 409, code: 'EMAIL_TAKEN' });
  }

  const user = {
    id: `u_${randomUUID()}`,
    email: normalized,
    name: displayName,
    username: normalizeUsername(displayName),
    salt,
    hash,
    createdAt: Date.now(),
  };
  db.users.push(user);
  const session = createSession(user.id);
  await persist();
  return { user: publicUser(user), token: session.token, expiresAt: session.expiresAt };
}

export async function login({ username, email, password }) {
  const handle = String(username || '').trim();
  const normalizedEmail = normalizeEmail(email || (handle.includes('@') ? handle : ''));
  const normalizedName = normalizeUsername(handle);
  const user = db.users.find((u) => normalizedName
    && (normalizeUsername(u.username) === normalizedName || normalizeUsername(u.name) === normalizedName))
    || (normalizedEmail && db.users.find((u) => u.email === normalizedEmail));
  const generic = Object.assign(new Error('用户名或密码不正确'), { status: 401, code: 'BAD_CREDENTIALS' });
  if (!user) throw generic;

  const hash = await hashPassword(String(password || ''), user.salt);
  const expected = Buffer.from(user.hash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw generic;

  const session = createSession(user.id);
  await persist();
  return { user: publicUser(user), token: session.token, expiresAt: session.expiresAt };
}

function createSession(userId) {
  cleanupSessions();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.sessions.push({ id: hashToken(token), userId, expiresAt, createdAt: Date.now() });
  return { token, expiresAt };
}

export function userForToken(token) {
  if (!token) return null;
  cleanupSessions();
  const id = hashToken(token);
  const session = db.sessions.find((s) => s.id === id && s.expiresAt > Date.now());
  if (!session) return null;
  const user = db.users.find((u) => u.id === session.userId);
  return user ? publicUser(user) : null;
}

export async function logout(token) {
  if (!token) return;
  const id = hashToken(token);
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.id !== id);
  if (db.sessions.length !== before) await persist();
}

export function getState(userId) {
  return db.states[userId] || null;
}

export async function putState(userId, payload) {
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) > MAX_STATE_BYTES) {
    throw Object.assign(new Error('项目数据超过 3 MB，请先删除部分旧项目'), { status: 413, code: 'STATE_TOO_LARGE' });
  }
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  db.states[userId] = {
    projects: projects.slice(0, 12),
    currentId: typeof payload?.currentId === 'string' ? payload.currentId : null,
    savedAt: Date.now(),
  };
  await persist();
  return db.states[userId];
}
