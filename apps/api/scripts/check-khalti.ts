/**
 * Asks Khalti to start a small test payment and prints exactly what it answers: `pnpm khalti:check`.
 * It tells a problem on our side (no key, or a wrong one) from one on Khalti's. Nothing is charged,
 * nothing is saved, and the key is never printed.
 */
import { env } from '../src/config/env.js';
import { KhaltiGateway } from '../src/services/gateways/khalti.js';

console.log(`Khalti address: ${env.KHALTI_BASE_URL}`);

if (!env.KHALTI_SECRET_KEY) {
  console.log(`
No KHALTI_SECRET_KEY in apps/api/.env, so the app shows Khalti as unavailable.

  1. Sign up at https://test-admin.khalti.com/#/join/merchant (the login OTP is 987654).
  2. Copy the key it calls live_secret_key.
  3. Put it in apps/api/.env as KHALTI_SECRET_KEY=... and restart pnpm dev.`);
  process.exit(1);
}

try {
  const result = await new KhaltiGateway().initiate({
    paymentId: `shikshya-check-${Date.now()}`,
    // Khalti's test mode only accepts small amounts: https://docs.khalti.com/gotchas/
    amountPaisa: 15000,
    purchaseName: 'Shikshya connection check',
    successUrl: `${env.API_PUBLIC_URL}/api/v1/payments/callback/khalti`,
    failureUrl: `${env.API_PUBLIC_URL}/api/v1/payments/callback/khalti`,
    websiteUrl: env.WEB_ORIGIN,
    customer: { name: 'Connection check', email: 'check@shikshya.test', phone: null },
  });
  console.log(`
OK: Khalti accepted the key and started a Rs. 150 test payment.
Payment page: ${result.redirectUrl}

If paying still fails after this point, the problem is on Khalti's pages rather than in Shikshya.`);
} catch (error) {
  console.log(`
FAILED: ${error instanceof Error ? error.message : String(error)}

"did not accept the merchant key" means the key is wrong, or is from admin.khalti.com rather
than test-admin.khalti.com. Anything else is Khalti's own answer, quoted as it sent it.`);
  process.exit(1);
}
