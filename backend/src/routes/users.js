const router = require('express').Router();
const { getUsers, getCallers, createUser, updateUser, resetPassword, toggleUserStatus } = require('../controllers/userController');
const { authenticate, requireManager } = require('../middleware/auth');

router.use(authenticate);

router.get('/', requireManager, getUsers);
router.get('/callers', getCallers);
router.post('/', requireManager, createUser);
router.put('/:id', requireManager, updateUser);
router.post('/:id/reset-password', requireManager, resetPassword);
router.patch('/:id/toggle-status', requireManager, toggleUserStatus);

module.exports = router;
