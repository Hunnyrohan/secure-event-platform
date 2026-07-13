'use strict';

// Deterministic secrets for the test environment ONLY.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long_padding';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long_pad_x';
// 32-byte key (64 hex chars) for AES-256-GCM.
process.env.DATA_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
process.env.CAPTCHA_ENABLED = 'false';
