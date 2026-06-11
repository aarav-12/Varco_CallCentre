const router = require('express').Router();
const { loginShift, logoutShift, startBreak, endBreak, getTodayAttendance, getMyAttendance, getMyTodayStatus } = require('../controllers/attendanceController');
const { authenticate, requireManager } = require('../middleware/auth');

router.use(authenticate);

router.post('/login', loginShift);
router.post('/logout', logoutShift);
router.post('/break/start', startBreak);
router.post('/break/end', endBreak);
router.get('/today', requireManager, getTodayAttendance);
router.get('/my', getMyAttendance);
router.get('/my/today', getMyTodayStatus);

module.exports = router;
