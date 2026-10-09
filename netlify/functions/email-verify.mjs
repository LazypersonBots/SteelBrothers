import { getStore } from '@netlify/blobs';
import { makeEmailVerification, readyForVerification, readEmailPayload, apiResponse } from '../../server/verification.mjs';

export default async function handler(request) {
  if (!readyForVerification()) {
    return apiResponse(503, { error: 'Ověřování e-mailů ještě není nakonfigurováno.' });
  }
  const { data, error } = await readEmailPayload(request, ['email', 'code']);
  if (error) return error;
  try {
    const store = getStore({ name: 'steelbrothers-email-codes-v1', region: 'eu-central-1', consistency: 'strong' });
    const service = makeEmailVerification({
      store,
      secret: process.env.STEELBROTHERS_VERIFICATION_SECRET,
      sendEmail: async () => { throw new Error('Verification endpoint cannot send email'); }
    });
    const result = await service.verify(data.email, data.code);
    return apiResponse(result.status, result.verified
      ? { verified: true, message: result.message }
      : { error: result.message });
  } catch (error) {
    console.error('Verification check error:', error?.name || 'unknown');
    return apiResponse(503, { error: 'Ověřování je dočasně nedostupné. Zkus to později.' });
  }
}

export const config = {
  path: '/api/email/verify',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip'] }
};
