// 샵앤링크 빙고투어 — Cloudflare Pages Worker (API + 정적 서빙)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, url); }
      catch (e) { return json({ error: e.message }, 500); }
    }
    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

const KST = "datetime('now','+9 hours')";

async function logEvent(env, phone, type, store, detail) {
  await env.DB.prepare(
    `INSERT INTO events (phone, type, store, detail, created_at) VALUES (?1, ?2, ?3, ?4, ${KST})`
  ).bind(phone, type, store || '', String(detail ?? '')).run();
}

async function handleApi(request, env, url) {
  const p = url.pathname;

  // 참여자 등록/갱신 (전화번호 기준 upsert)
  if (p === '/api/register' && request.method === 'POST') {
    const { name, phone, address } = await request.json();
    if (!name || !phone) return json({ error: 'name/phone required' }, 400);
    await env.DB.prepare(
      `INSERT INTO users (phone, name, address, created_at, last_seen) VALUES (?1, ?2, ?3, ${KST}, ${KST})
       ON CONFLICT(phone) DO UPDATE SET name = ?2, address = ?3, last_seen = ${KST}`
    ).bind(phone, name, address || '').run();
    await logEvent(env, phone, 'register', '', '');
    return json({ ok: true });
  }

  // 이용기록 (스탬프/빙고/응모 등)
  if (p === '/api/event' && request.method === 'POST') {
    const { phone, type, store, detail } = await request.json();
    if (!phone || !type) return json({ error: 'phone/type required' }, 400);
    await env.DB.prepare(`UPDATE users SET last_seen = ${KST} WHERE phone = ?1`).bind(phone).run();
    await logEvent(env, phone, type, store, detail);
    return json({ ok: true });
  }

  // ─── 관리자 API (인증 필요) ───
  if (p.startsWith('/api/admin/')) {
    const key = request.headers.get('x-admin-key') || '';
    const expected = env.ADMIN_KEY || 'sharo-glow-7392';
    if (key !== expected) return json({ error: 'unauthorized' }, 401);

    if (p === '/api/admin/login') return json({ ok: true });

    if (p === '/api/admin/data') {
      const users = await env.DB.prepare(
        `SELECT u.phone, u.name, u.address, u.created_at, u.last_seen,
           (SELECT COUNT(*) FROM events e WHERE e.phone = u.phone AND e.type = 'stamp') AS stamps,
           (SELECT COALESCE(SUM(CAST(e.detail AS INTEGER)), 0) FROM events e WHERE e.phone = u.phone AND e.type = 'ticket') AS tickets,
           (SELECT COUNT(*) FROM events e WHERE e.phone = u.phone AND e.type = 'bingo_line') AS bingo_lines
         FROM users u ORDER BY u.created_at DESC`
      ).all();
      const events = await env.DB.prepare(
        `SELECT e.id, e.phone, e.type, e.store, e.detail, e.created_at, u.name
         FROM events e LEFT JOIN users u ON u.phone = e.phone
         ORDER BY e.id DESC LIMIT 500`
      ).all();
      const totals = await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM users) AS total_users,
           (SELECT COUNT(*) FROM users WHERE date(created_at) = date('now','+9 hours')) AS today_users,
           (SELECT COUNT(*) FROM events WHERE type = 'stamp') AS total_stamps,
           (SELECT COALESCE(SUM(CAST(detail AS INTEGER)), 0) FROM events WHERE type = 'ticket') AS total_tickets,
           (SELECT COUNT(*) FROM events WHERE type = 'bingo_all') AS total_allclear`
      ).first();
      return json({ users: users.results, events: events.results, totals });
    }
  }

  return json({ error: 'not found' }, 404);
}
