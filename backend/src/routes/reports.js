const router = require('express').Router();
const { getDailyReport, getWeeklyReport, getMonthlyReport, exportReport, getLeaderboard } = require('../controllers/reportController');
const { authenticate, requireManager } = require('../middleware/auth');

router.use(authenticate, requireManager);

router.get('/daily', getDailyReport);
router.get('/weekly', getWeeklyReport);
router.get('/monthly', getMonthlyReport);
router.get('/export', exportReport);
router.get('/leaderboard', getLeaderboard);

module.exports = router;
