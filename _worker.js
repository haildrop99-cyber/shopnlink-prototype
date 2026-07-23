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

  // 업체 목록 (공개 — 코드는 제외)
  if (p === '/api/stores' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT key, name, cat, cond, coupon_name, emoji, image FROM stores ORDER BY rowid`
    ).all();
    return json({ stores: rows.results });
  }

  // 쿠폰 발행 — 매장 코드 검증 (대소문자 무시). 성공 시 서버에서 스탬프 기록
  if (p === '/api/redeem' && request.method === 'POST') {
    const { phone, storeKey, code } = await request.json();
    if (!storeKey || !code) return json({ error: 'storeKey/code required' }, 400);
    const row = await env.DB.prepare(`SELECT name, code FROM stores WHERE key = ?1`).bind(storeKey).first();
    if (!row) return json({ error: 'store not found' }, 404);
    if (String(code).trim().toUpperCase() !== String(row.code || '').trim().toUpperCase()) {
      return json({ ok: false, reason: 'invalid_code' });
    }
    if (phone) {
      await env.DB.prepare(`UPDATE users SET last_seen = ${KST} WHERE phone = ?1`).bind(phone).run();
      await logEvent(env, phone, 'stamp', row.name, '코드인증');
    }
    return json({ ok: true });
  }

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

    // 업체 목록 (코드 포함)
    if (p === '/api/admin/stores' && request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT * FROM stores ORDER BY rowid`).all();
      return json({ stores: rows.results });
    }

    // 업체 정보 수정 (쿠폰명·조건·이미지·코드)
    if (p === '/api/admin/store/update' && request.method === 'POST') {
      const { key, name, cond, coupon_name, image, code } = await request.json();
      if (!key) return json({ error: 'key required' }, 400);
      if (code !== undefined && String(code).trim().length !== 6) return json({ error: 'code must be 6 chars' }, 400);
      await env.DB.prepare(
        `UPDATE stores SET
           name = COALESCE(?2, name),
           cond = COALESCE(?3, cond),
           coupon_name = COALESCE(?4, coupon_name),
           image = COALESCE(?5, image),
           code = COALESCE(?6, code)
         WHERE key = ?1`
      ).bind(key, name ?? null, cond ?? null, coupon_name ?? null, image ?? null,
             code !== undefined ? String(code).trim().toUpperCase() : null).run();
      return json({ ok: true });
    }

    // 참여자 정보 수정
    if (p === '/api/admin/user/update' && request.method === 'POST') {
      const { phone, name, address } = await request.json();
      if (!phone) return json({ error: 'phone required' }, 400);
      await env.DB.prepare(`UPDATE users SET name = ?2, address = ?3 WHERE phone = ?1`)
        .bind(phone, name || '', address || '').run();
      return json({ ok: true });
    }

    // 참여자 삭제 (이용기록 포함)
    if (p === '/api/admin/user/delete' && request.method === 'POST') {
      const { phone } = await request.json();
      if (!phone) return json({ error: 'phone required' }, 400);
      await env.DB.prepare(`DELETE FROM events WHERE phone = ?1`).bind(phone).run();
      await env.DB.prepare(`DELETE FROM users WHERE phone = ?1`).bind(phone).run();
      return json({ ok: true });
    }

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
