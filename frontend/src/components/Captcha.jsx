import { useRef } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

// True only when a site key is configured. When false (typical in dev) the
// widget is not rendered and forms submit without a CAPTCHA — this keeps the
// existing auth flows usable locally while enabling protection in production.
export const captchaEnabled = Boolean(SITE_KEY);

/**
 * Google reCAPTCHA v2 (checkbox) wrapper.
 *  - onToken(token) fires with the solved token, or null when it expires /
 *    errors, so the parent can gate form submission.
 *  - expose reset() via ref so a form can clear the widget after submit.
 */
export default function Captcha({ onToken }) {
  const ref = useRef(null);
  if (!captchaEnabled) return null;

  return (
    <ReCAPTCHA
      ref={ref}
      sitekey={SITE_KEY}
      onChange={(token) => onToken(token || null)}
      onExpired={() => onToken(null)}
      onErrored={() => onToken(null)}
    />
  );
}
