const express = require('express');
const router = express.Router();
const verifyToken = require('../Middlewares/verifyToken');
const aiRateLimit = require('../Middlewares/aiRateLimit');
const { chat, getHistory, clearHistory } = require('../controllers/aiController');

router.post('/chat', verifyToken, aiRateLimit, chat);
router.get('/history', verifyToken, getHistory);
router.delete('/history', verifyToken, clearHistory);

module.exports = router;
