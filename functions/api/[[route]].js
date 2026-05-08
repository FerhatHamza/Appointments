// Cloudflare Pages Function – handles all /api/* routes

const ADMIN_PASSWORD = 'admin123'; // same hardcoded password

function generateTimeSlots() {
  const slots = [];
  const startMinutes = 8 * 60 + 30; // 08:30
  const endMinutes = 14 * 60;      // 14:00
  for (let m = startMinutes; m <= endMinutes - 20; m += 20) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(hh + ':' + mm);
  }
  return slots;
}

function isAdmin(request) {
  const pass = request.headers.get('x-admin-password');
  return pass === ADMIN_PASSWORD;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  };
  if (method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    // === Specialists ===
    if (path === '/api/specialists' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM specialists').all();
      return new Response(JSON.stringify(results), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    if (path === '/api/specialists' && method === 'POST') {
      if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 });
      const { name, specialty } = await request.json();
      await env.DB.prepare('INSERT INTO specialists (name, specialty) VALUES (?, ?)').bind(name, specialty || null).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (path.startsWith('/api/specialists/') && method === 'PUT') {
      if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 });
      const id = path.split('/')[3];
      const { name, specialty } = await request.json();
      await env.DB.prepare('UPDATE specialists SET name = ?, specialty = ? WHERE id = ?').bind(name, specialty || null, id).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (path.startsWith('/api/specialists/') && method === 'DELETE') {
      if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 });
      const id = path.split('/')[3];
      // cascade deletion
      await env.DB.prepare('DELETE FROM specialist_tokens WHERE specialist_id = ?').bind(id).run();
      const schedules = await env.DB.prepare('SELECT id FROM schedules WHERE specialist_id = ?').bind(id).all();
      for (const sched of schedules.results) {
        await env.DB.prepare('DELETE FROM reservations WHERE slot_id IN (SELECT id FROM slots WHERE schedule_id = ?)').bind(sched.id).run();
        await env.DB.prepare('DELETE FROM slots WHERE schedule_id = ?').bind(sched.id).run();
      }
      await env.DB.prepare('DELETE FROM schedules WHERE specialist_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM specialists WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // === Schedules ===
    if (path === '/api/schedules' && method === 'GET') {
      const specialistId = url.searchParams.get('specialist_id');
      let query = 'SELECT * FROM schedules';
      const params = [];
      if (specialistId) {
        query += ' WHERE specialist_id = ?';
        params.push(specialistId);
      }
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify(results), { headers });
    }

    if (path === '/api/schedules' && method === 'POST') {
      if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 });
      const { specialist_id, date } = await request.json();
      const existing = await env.DB.prepare('SELECT id FROM schedules WHERE specialist_id = ? AND date = ?').bind(specialist_id, date).first();
      if (existing) return new Response(JSON.stringify({ error: 'يوجد جدول بالفعل لهذا التاريخ' }), { status: 400, headers });
      const info = await env.DB.prepare('INSERT INTO schedules (specialist_id, date) VALUES (?, ?)').bind(specialist_id, date).run();
      const scheduleId = info.meta.last_row_id;
      const slots = generateTimeSlots();
      const stmt = env.DB.prepare('INSERT INTO slots (schedule_id, start_time) VALUES (?, ?)');
      const batch = slots.map(time => stmt.bind(scheduleId, time));
      await env.DB.batch(batch);
      return new Response(JSON.stringify({ success: true, id: scheduleId }), { headers });
    }

    if (path.startsWith('/api/schedules/') && method === 'DELETE') {
      if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 });
      const id = path.split('/')[3];
      await env.DB.prepare('DELETE FROM reservations WHERE slot_id IN (SELECT id FROM slots WHERE schedule_id = ?)').bind(id).run();
      await env.DB.prepare('DELETE FROM slots WHERE schedule_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // === Slots ===
    if (path === '/api/slots' && method === 'GET') {
      const scheduleId = url.searchParams.get('schedule_id');
      const available = url.searchParams.get('available');
      if (!scheduleId) return new Response('Missing schedule_id', { status: 400 });
      let query = 'SELECT * FROM slots WHERE schedule_id = ?';
      const params = [scheduleId];
      if (available === '1') query += ' AND is_reserved = 0';
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify(results), { headers });
    }

    // === Reservations ===
    if (path === '/api/reservations' && method === 'GET') {
      const showAll = url.searchParams.get('all') === 'true';
      if (!showAll) return new Response(JSON.stringify([]), { headers });
      if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 });
      const { results } = await env.DB.prepare(`
        SELECT r.*, s.start_time, sch.date, spec.name as specialist_name
        FROM reservations r
        JOIN slots s ON r.slot_id = s.id
        JOIN schedules sch ON s.schedule_id = sch.id
        JOIN specialists spec ON sch.specialist_id = spec.id
        ORDER BY sch.date, s.start_time
      `).all();
      return new Response(JSON.stringify(results), { headers });
    }

    if (path === '/api/reservations' && method === 'POST') {
      const { slot_id, nin, first_name, last_name, dob, letter_base64 } = await request.json();
      const slot = await env.DB.prepare('SELECT id FROM slots WHERE id = ? AND is_reserved = 0').bind(slot_id).first();
      if (!slot) return new Response(JSON.stringify({ error: 'الوقت محجوز أو غير متوفر' }), { status: 409, headers });
      await env.DB.prepare('INSERT INTO reservations (slot_id, patient_nin, patient_first_name, patient_last_name, patient_dob, letter_base64) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(slot_id, nin, first_name, last_name, dob, letter_base64 || null).run();
      await env.DB.prepare('UPDATE slots SET is_reserved = 1 WHERE id = ?').bind(slot_id).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (path.startsWith('/api/reservations/') && method === 'DELETE') {
      if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 });
      const id = path.split('/')[3];
      const reservation = await env.DB.prepare('SELECT slot_id FROM reservations WHERE id = ?').bind(id).first();
      if (!reservation) return new Response('Not found', { status: 404 });
      await env.DB.prepare('DELETE FROM reservations WHERE id = ?').bind(id).run();
      await env.DB.prepare('UPDATE slots SET is_reserved = 0 WHERE id = ?').bind(reservation.slot_id).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // === Generate specialist token ===
    if (path === '/api/generate-token' && method === 'POST') {
      if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 });
      const { specialist_id } = await request.json();
      const token = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO specialist_tokens (specialist_id, token) VALUES (?, ?)').bind(specialist_id, token).run();
      return new Response(JSON.stringify({ token }), { headers });
    }

    // === Specialist reservations by token ===
    if (path === '/api/specialist-reservations' && method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token) return new Response('Token missing', { status: 400 });
      const tokenRow = await env.DB.prepare('SELECT specialist_id FROM specialist_tokens WHERE token = ?').bind(token).first();
      if (!tokenRow) return new Response(JSON.stringify({ error: 'رمز غير صالح' }), { status: 403, headers });
      const specialistId = tokenRow.specialist_id;
      const { results } = await env.DB.prepare(`
        SELECT r.*, s.start_time, sch.date, spec.name as specialist_name
        FROM reservations r
        JOIN slots s ON r.slot_id = s.id
        JOIN schedules sch ON s.schedule_id = sch.id
        JOIN specialists spec ON sch.specialist_id = spec.id
        WHERE spec.id = ?
        ORDER BY sch.date, s.start_time
      `).bind(specialistId).all();
      return new Response(JSON.stringify({ specialistId: specialistId, reservations: results }), { headers });
    }

    return new Response('Not Found', { status: 404, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
