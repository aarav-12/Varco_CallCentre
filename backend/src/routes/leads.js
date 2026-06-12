const router = require('express').Router();
const multer = require('multer');
const {
  getLeads, getLeadById, createLead, updateLead, deleteLead,
  bulkDelete, bulkReassign, addNote, exportLeads, importLeads, importLeadsJson
} = require('../controllers/leadController');
const { authenticate, requireManager } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate);

router.get('/', getLeads);
router.get('/export', exportLeads);
router.get('/:id', getLeadById);
router.post('/', requireManager, createLead);
router.put('/:id', updateLead);
router.delete('/bulk', requireManager, bulkDelete);
router.post('/bulk-reassign', requireManager, bulkReassign);
router.delete('/:id', requireManager, deleteLead);
router.post('/:id/notes', addNote);
router.post('/import', requireManager, upload.single('file'), importLeads);
router.post('/import-json', requireManager, importLeadsJson);

module.exports = router;
