const router = require('express').Router();
const { getLogs, exportLogs } = require('../controllers/activityLogController');
const { authenticate, requireManager } = require('../middleware/auth');

router.use(authenticate, requireManager);

router.get('/', getLogs);
router.get('/export', exportLogs);

module.exports = router;
