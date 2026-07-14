'use strict';

const { forbidden } = require('../utils/httpError');

/**
 * Role-Based Access Control (RBAC) enforcing least privilege.
 *
 * Roles: 'admin' > 'organizer' > 'user'. `admin` implicitly passes any
 * role check. Use `requireRole('admin')` for vertical access control and
 * ownership checks in the service layer for horizontal access control.
 */
const HIERARCHY = { admin: 3, organizer: 2, user: 1 };

function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return next(forbidden());
    if (role === 'admin') return next();          // admin is a superset
    if (allowed.includes(role)) return next();
    return next(forbidden('Insufficient role for this action'));
  };
}

/** Require at least the given role level (hierarchical). */
function requireAtLeast(minRole) {
  return (req, res, next) => {
    const level = HIERARCHY[req.user?.role] || 0;
    if (level >= (HIERARCHY[minRole] || 99)) return next();
    return next(forbidden('Insufficient privilege level'));
  };
}

module.exports = { requireRole, requireAtLeast, HIERARCHY };
