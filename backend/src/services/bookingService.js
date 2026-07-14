'use strict';

const db = require('../config/db');
const audit = require('./auditService');
const {
  notFound, conflict, badRequest, forbidden,
} = require('../utils/httpError');

/**
 * Booking integrity & concurrency safety.
 *
 * A booking must (a) not exceed capacity and (b) be unique per user/event.
 * Both are enforced atomically:
 *   - We lock the event row (SELECT ... FOR UPDATE) inside a transaction so
 *     two concurrent requests can't both read the last free seat (fixes the
 *     classic race condition / overselling bug).
 *   - The UNIQUE(event_id, user_id) constraint blocks duplicate bookings;
 *     any violation rolls the whole transaction back.
 */
async function book(user, eventId, req) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, capacity, seats_taken FROM events WHERE id = $1 FOR UPDATE',
      [eventId],
    );
    const event = rows[0];
    if (!event) throw notFound('Event not found');
    if (event.seats_taken >= event.capacity) throw conflict('Event is fully booked');

    // Re-activate a previously cancelled booking, else insert a new one.
    const existing = await client.query(
      'SELECT id, status FROM bookings WHERE event_id = $1 AND user_id = $2',
      [eventId, user.id],
    );
    let bookingId;
    if (existing.rows[0]) {
      if (existing.rows[0].status === 'confirmed') throw conflict('You have already booked this event');
      const r = await client.query(
        `UPDATE bookings SET status = 'confirmed', cancelled_at = NULL, created_at = now()
          WHERE id = $1 RETURNING id`,
        [existing.rows[0].id],
      );
      bookingId = r.rows[0].id;
    } else {
      const r = await client.query(
        'INSERT INTO bookings (event_id, user_id) VALUES ($1,$2) RETURNING id',
        [eventId, user.id],
      );
      bookingId = r.rows[0].id;
    }

    await client.query('UPDATE events SET seats_taken = seats_taken + 1 WHERE id = $1', [eventId]);

    await audit.record({
      actorId: user.id, action: audit.ACTIONS.BOOKING_CREATE,
      targetType: 'booking', targetId: bookingId, req,
    });
    return { id: bookingId, eventId, status: 'confirmed' };
  });
}

async function cancel(user, bookingId, req) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId],
    );
    const booking = rows[0];
    if (!booking) throw notFound('Booking not found');
    // IDOR guard: a user can only cancel their OWN booking (admin may cancel any).
    if (booking.user_id !== user.id && user.role !== 'admin') {
      throw forbidden('This booking does not belong to you');
    }
    if (booking.status === 'cancelled') throw badRequest('Booking already cancelled');

    await client.query(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = $1",
      [bookingId],
    );
    await client.query(
      'UPDATE events SET seats_taken = GREATEST(seats_taken - 1, 0) WHERE id = $1',
      [booking.event_id],
    );
    await audit.record({
      actorId: user.id, action: audit.ACTIONS.BOOKING_CANCEL,
      targetType: 'booking', targetId: bookingId, req,
    });
    return { id: bookingId, status: 'cancelled' };
  });
}

/** A user's own booking history (scoped by user_id -> no IDOR). */
async function history(userId) {
  const { rows } = await db.query(
    `SELECT b.id, b.status, b.created_at, b.cancelled_at,
            e.id AS event_id, e.title, e.starts_at, e.location, e.ticket_price
       FROM bookings b JOIN events e ON e.id = b.event_id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC`,
    [userId],
  );
  return rows;
}

module.exports = { book, cancel, history };
