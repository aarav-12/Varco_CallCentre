const router = require('express').Router();
const { getCalls, logCall, getCallerStats, getTeamStats, getTrends } = require('../controllers/callController');
const { authenticate, requireManager } = require('../middleware/auth');

router.use(authenticate);

router.get('/', getCalls);
router.post('/', logCall);
router.get('/stats/caller', getCallerStats);
router.get('/stats/team', requireManager, getTeamStats);
router.get('/trends', getTrends);

module.exports = router;
