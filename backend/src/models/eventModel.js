'use strict';

const db = require('../config/db');

function view(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizerId: row.organizer_id,
    title: row.title,
    description: row.description,
    location: row.location,
    category: row.category,
    startsAt: row.starts_at,
    capacity: row.capacity,
    seatsTaken: row.seats_taken,
    seatsAvailable: row.capacity - row.seats_taken,
    ticketPrice: Number(row.ticket_price),
    isPublished: row.is_published,
    createdAt: row.created_at,
  };
}

async function create(organizerId, data) {
  const { rows } = await db.query(
    `INSERT INTO events (organizer_id, title, description, location, category,
                         starts_at, capacity, ticket_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [organizerId, data.title, data.description, data.location, data.category,
      data.startsAt, data.capacity, data.ticketPrice],
  );
  return view(rows[0]);
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM events WHERE id = $1', [id]);
  return rows[0] || null; // raw row (has organizer_id for ownership checks)
}

async function list({ limit = 50, offset = 0, category } = {}) {
  const params = [Math.min(Number(limit) || 50, 200), Number(offset) || 0];
  let where = 'WHERE is_published = TRUE';
  if (category) { params.push(category); where += ` AND category = $${params.length}`; }
  const { rows } = await db.query(
    `SELECT * FROM events ${where} ORDER BY starts_at ASC LIMIT $1 OFFSET $2`, params,
  );
  return rows.map(view);
}

async function update(id, data) {
  const { rows } = await db.query(
    `UPDATE events SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        location = COALESCE($4, location),
        category = COALESCE($5, category),
        starts_at = COALESCE($6, starts_at),
        capacity = COALESCE($7, capacity),
        ticket_price = COALESCE($8, ticket_price)
      WHERE id = $1 RETURNING *`,
    [id, data.title, data.description, data.location, data.category,
      data.startsAt, data.capacity, data.ticketPrice],
  );
  return view(rows[0]);
}

async function remove(id) {
  await db.query('DELETE FROM events WHERE id = $1', [id]);
}

async function attendees(eventId) {
  const { rows } = await db.query(
    `SELECT u.id, u.full_name, u.email, b.created_at AS booked_at
       FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE b.event_id = $1 AND b.status = 'confirmed'
      ORDER BY b.created_at ASC`,
    [eventId],
  );
  return rows;
}

module.exports = { view, create, findById, list, update, remove, attendees };
