import { createSteelBrothersServer } from './server/render-app.mjs';
import { readyForVerification } from './server/verification.mjs';

const port = Number(process.env.PORT || 10000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createSteelBrothersServer();
server.listen(port, '0.0.0.0', () => {
  console.log('Steel Brothers running on 0.0.0.0:' + port);
  // Log configuration state, NEVER keys or email addresses. Real delivery is
  // confirmed only when a user receives and verifies a code.
  const configured = process.env.RENDER === 'true' &&
    process.env.IS_PULL_REQUEST !== 'true' &&
    readyForVerification({ ...process.env, CONTEXT: 'production' });
  console.log(configured
    ? 'Steel Brothers email verification: CONFIGURED (delivery not yet tested)'
    : 'Steel Brothers email verification: NOT CONFIGURED');
  if (!configured) {
    console.log('Resend sending key: ' +
      (process.env.RESEND_API_KEY?.startsWith('re_') ? 'present' : 'missing or invalid'));
    console.log('Verification signing secret: ' +
      ((process.env.STEELBROTHERS_VERIFICATION_SECRET?.length || 0) >= 32
        ? 'present' : 'missing or too short'));
  }
});
