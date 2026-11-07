/**
 * Khalti ePayment (KPG-2), following https://docs.khalti.com/khalti-epayment/
 * Amounts are already in paisa here.
 */
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/errors.js';
import type {
  InitiateInput,
  InitiateOutput,
  PaymentGateway,
  VerifyInput,
  VerifyResult,
} from './types.js';

const headers = () => {
  if (!env.KHALTI_SECRET_KEY) {
    throw new ApiError(503, 'GATEWAY_NOT_CONFIGURED', 'Khalti payments are not set up yet');
  }
  return {
    Authorization: `Key ${env.KHALTI_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
};

/**
 * Turns Khalti's error into a sentence, so the real reason is visible rather than a generic
 * failure. Its errors come as { detail: "..." } or as { field: ["..."] }. In test mode the
 * usual ones are about the amount: https://docs.khalti.com/gotchas/
 */
export function describeKhaltiError(status: number, body: Record<string, unknown>) {
  if (status === 401) return 'Khalti did not accept the merchant key';
  if (typeof body.detail === 'string') return body.detail;
  for (const [field, value] of Object.entries(body)) {
    if (field === 'error_key') continue;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return `Khalti answered with status ${status}`;
}

/**
 * Without customer_info, Khalti's page shows the merchant's own name under "Billed To". Khalti
 * checks any phone it is sent, and many students have none on record, so the phone only goes when
 * it looks like a Nepali mobile number.
 */
function customerInfo(customer: InitiateInput['customer']) {
  const phone = customer.phone?.replace(/[\s-]/g, '');
  return {
    name: customer.name,
    email: customer.email,
    ...(phone && /^9[78]\d{8}$/.test(phone) ? { phone } : {}),
  };
}

export class KhaltiGateway implements PaymentGateway {
  async initiate(input: InitiateInput): Promise<InitiateOutput> {
    const requestHeaders = headers();
    let response: Response;
    try {
      response = await fetch(`${env.KHALTI_BASE_URL}/epayment/initiate/`, {
        method: 'POST',
        headers: requestHeaders,
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          return_url: input.successUrl,
          website_url: input.websiteUrl,
          amount: input.amountPaisa,
          purchase_order_id: input.paymentId,
          purchase_order_name: input.purchaseName,
          customer_info: customerInfo(input.customer),
        }),
      });
    } catch {
      throw new ApiError(502, 'GATEWAY_UNAVAILABLE', 'Could not reach Khalti. Please try again.');
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || typeof body.pidx !== 'string' || typeof body.payment_url !== 'string') {
      console.error('Khalti initiate failed', response.status, body);
      throw new ApiError(
        502,
        'GATEWAY_ERROR',
        `Khalti could not start this payment: ${describeKhaltiError(response.status, body)}`,
      );
    }
    return { redirectUrl: body.payment_url, gatewayRef: body.pidx };
  }

  /** Only finds the payment. Nothing else in the query string is believed. */
  identifyCallback(params: Record<string, unknown>) {
    return typeof params.purchase_order_id === 'string' ? params.purchase_order_id : null;
  }

  /**
   * Khalti's rules: only Completed is success. Expired and cancelled are failures, and
   * refunded means do not provide the service. Anything else: hold it.
   */
  async verify(payment: VerifyInput): Promise<VerifyResult> {
    const hold = (raw: unknown): VerifyResult => ({
      state: 'PENDING',
      gatewayRef: payment.gatewayRef,
      amountPaisa: null,
      raw,
    });
    if (!payment.gatewayRef) return hold({ error: 'No pidx recorded for this payment' });

    let body: {
      status?: string;
      total_amount?: number;
      transaction_id?: string | null;
    };
    try {
      // Lookup answers with HTTP 400 for expired and cancelled, so the body decides, not the code.
      const response = await fetch(`${env.KHALTI_BASE_URL}/epayment/lookup/`, {
        method: 'POST',
        headers: headers(),
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ pidx: payment.gatewayRef }),
      });
      body = (await response.json()) as typeof body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      return hold({ error: String(error) });
    }

    const result = {
      gatewayRef: body.transaction_id ?? payment.gatewayRef,
      amountPaisa: typeof body.total_amount === 'number' ? body.total_amount : null,
      raw: body,
    };
    switch (body.status) {
      case 'Completed':
        return { state: 'SUCCESS', ...result };
      case 'Expired':
      case 'User canceled':
      case 'Refunded':
        return { state: 'FAILED', ...result };
      // Pending, Initiated, Partially Refunded and anything unknown: Khalti says to hold.
      default:
        return { state: 'PENDING', ...result };
    }
  }
}
