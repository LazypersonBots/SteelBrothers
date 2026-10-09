import { getStore } from '@netlify/blobs';
import { makeEmailVerification, readyForVerification, readEmailPayload, apiResponse } from '../../server/verification.mjs';
import { renderVerificationEmail } from '../../server/email-template.mjs';

export default async function handler(request) {
  if (request.method === 'GET') {
    return apiResponse(200, { available: readyForVerification(), accountCreation: false });
  }
  if (!readyForVerification()) {
    return apiResponse(503, { error: 'Ověřování e-mailů ještě není nakonfigurováno.' });
  }
  const { data, error } = await readEmailPayload(request, ['email']);
  if (error) return error;

  try {
    const store = getStore({ name: 'steelbrothers-email-codes-v1', region: 'eu-central-1', consistency: 'strong' });
    const service = makeEmailVerification({
      store, secret: process.env.STEELBROTHERS_VERIFICATION_SECRET,
      async sendEmail({ email, code, id }) {
        const body = renderVerificationEmail(code);
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
            'Content-Type': 'application/json',
            'Idempotency-Key': 'steelbrothers-otp-' + id
          },
          body: JSON.stringify({
            from: 'Steel Brothers <verification@steelbrothers.cz>',
            to: [email],
            subject: 'Steel Brothers — Ověřovací kód',
            html: body.html,
            text: body.text
          }),
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) {
          // Never log addresses, code, credentials or the provider's full response.
          console.error('Verification email delivery rejected', response.status);
          throw new Error('Resend rejected the email');
        }
      }
    });
    const result = await service.send(data.email);
    return apiResponse(result.status, result.status === 200
      ? { message: result.message } : { error: result.message });
  } catch (error) {
    console.error('Verification email service error:', error?.name || 'unknown');
    return apiResponse(503, { error: 'Ověřování je dočasně nedostupné. Zkus to později.' });
  }
}

export const config = {
  path: '/api/email/send',
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip'] }
};
