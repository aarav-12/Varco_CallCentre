const router = require('express').Router();
const { getAlerts, getUnreadCount, markAsRead, markAllRead, resolveAlert } = require('../controllers/alertController');
const { authenticate, requireManager } = require('../middleware/auth');

router.use(authenticate);

router.get('/', requireManager, getAlerts);
router.get('/unread-count', requireManager, getUnreadCount);
router.patch('/mark-all-read', requireManager, markAllRead);
router.patch('/:id/read', requireManager, markAsRead);
router.patch('/:id/resolve', requireManager, resolveAlert);

module.exports = router;
