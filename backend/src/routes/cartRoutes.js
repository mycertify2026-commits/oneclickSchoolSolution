const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/cartController');
const { authenticate, requireRole } = require('../middleware/auth');

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { message: 'Too many attempts, try again later.' } });

router.use(authenticate, requireRole('schoolAdmin'));
router.get('/prices',          controller.getPrices);
router.post('/preview',        controller.previewCertificate);
router.get('/',                controller.listCart);
router.post('/items',          controller.addToCart);
router.delete('/items/:id',    controller.removeFromCart);
router.post('/submit',         controller.submitCart);
router.post('/resend-otp',     otpLimiter, controller.resendOtp);
router.post('/verify-otp',     otpLimiter, controller.verifyOtp);

module.exports = router;
