import { can } from '../lib/permissions.js';

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (!can(req.user.role, permission)) {
      return res.status(403).json({ message: `Permission denied: ${permission}` });
    }
    next();
  };
}
