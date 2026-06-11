const router = require('express').Router();
const { getFollowUps, getTodayFollowUps, createFollowUp, completeFollowUp } = require('../controllers/followupController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', getFollowUps);
router.get('/today', getTodayFollowUps);
router.post('/', createFollowUp);
router.patch('/:id/complete', completeFollowUp);

module.exports = router;
