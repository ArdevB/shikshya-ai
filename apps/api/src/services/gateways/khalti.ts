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
          customer_info: {
            name: input.customer.name,
            email: input.customer.email,
            phone: input.customer.phone ?? undefined,
          },
        }),
      });
    } catch {
      throw new ApiError(502, 'GATEWAY_UNAVAILABLE', 'Could not reach Khalti. Please try again.');
    }

    const body = (await response.json().catch(() => ({}))) as {
      pidx?: string;
      payment_url?: string;
    };
    if (!response.ok || !body.pidx || !body.payment_url) {
      console.error('Khalti initiate failed', response.status, body);
      throw new ApiError(502, 'GATEWAY_ERROR', 'Khalti could not start this payment');
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
