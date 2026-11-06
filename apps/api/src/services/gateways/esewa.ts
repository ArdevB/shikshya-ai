/**
 * eSewa ePay v2, following https://developer.esewa.com.np/pages/Epay
 * Amounts are in rupees here, so they are converted at this boundary only.
 */
import { rupeesToPaisa } from '@shikshya/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import type {
  InitiateInput,
  InitiateOutput,
  PaymentGateway,
  VerifyInput,
  VerifyResult,
} from './types.js';

const REQUEST_SIGNED_FIELDS = 'total_amount,transaction_uuid,product_code';

/** 11050 paisa becomes "110.5". The same text must be signed, sent and checked. */
export const paisaToRupeesText = (paisa: number) => String(paisa / 100);

/** HMAC-SHA256, base64, as the docs specify. */
export const esewaSignature = (message: string, secretKey: string) =>
  createHmac('sha256', secretKey).update(message).digest('base64');

/** Builds "a=1,b=2" from the listed fields, in the listed order. */
export const signedMessage = (signedFieldNames: string, fields: Record<string, unknown>) =>
  signedFieldNames
    .split(',')
    .map((name) => `${name}=${String(fields[name])}`)
    .join(',');

function signaturesMatch(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class EsewaGateway implements PaymentGateway {
  async initiate(input: InitiateInput): Promise<InitiateOutput> {
    const totalAmount = paisaToRupeesText(input.amountPaisa);
    const fields = {
      amount: totalAmount,
      tax_amount: '0',
      total_amount: totalAmount,
      transaction_uuid: input.paymentId,
      product_code: env.ESEWA_PRODUCT_CODE,
      product_service_charge: '0',
      product_delivery_charge: '0',
      success_url: input.successUrl,
      failure_url: input.failureUrl,
      signed_field_names: REQUEST_SIGNED_FIELDS,
    };
    return {
      formAction: env.ESEWA_FORM_URL,
      formFields: {
        ...fields,
        signature: esewaSignature(
          signedMessage(REQUEST_SIGNED_FIELDS, fields),
          env.ESEWA_SECRET_KEY,
        ),
      },
    };
  }

  /**
   * eSewa redirects with ?data=<base64 JSON>, signed over the fields it lists. A redirect that
   * fails this check is ignored, but the payment can still complete: verify() and the
   * reconciliation job ask eSewa directly.
   */
  identifyCallback(params: Record<string, unknown>) {
    if (typeof params.data !== 'string') return null;
    let decoded: Record<string, unknown>;
    try {
      decoded = JSON.parse(Buffer.from(params.data, 'base64').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
    const names = decoded.signed_field_names;
    const signature = decoded.signature;
    if (typeof names !== 'string' || typeof signature !== 'string') return null;

    const expected = esewaSignature(signedMessage(names, decoded), env.ESEWA_SECRET_KEY);
    if (!signaturesMatch(expected, signature)) return null;
    return typeof decoded.transaction_uuid === 'string' ? decoded.transaction_uuid : null;
  }

  async verify(payment: VerifyInput): Promise<VerifyResult> {
    const url = new URL(env.ESEWA_STATUS_URL);
    url.searchParams.set('product_code', env.ESEWA_PRODUCT_CODE);
    url.searchParams.set('total_amount', paisaToRupeesText(payment.amountPaisa));
    url.searchParams.set('transaction_uuid', payment.id);

    let body: { status?: string; total_amount?: number | string; ref_id?: string | null };
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      body = (await response.json()) as typeof body;
    } catch (error) {
      return {
        state: 'PENDING',
        gatewayRef: payment.gatewayRef,
        amountPaisa: null,
        raw: { error: String(error) },
      };
    }

    const amountPaisa =
      body.total_amount === undefined ? null : rupeesToPaisa(normaliseAmount(body.total_amount));
    const gatewayRef = body.ref_id ?? payment.gatewayRef;

    switch (body.status) {
      case 'COMPLETE':
        return { state: 'SUCCESS', gatewayRef, amountPaisa, raw: body };
      case 'NOT_FOUND':
      case 'CANCELED':
      case 'FULL_REFUND':
      case 'PARTIAL_REFUND':
        return { state: 'FAILED', gatewayRef, amountPaisa, raw: body };
      // PENDING, AMBIGUOUS and "service unavailable" all mean it is not known yet.
      default:
        return { state: 'PENDING', gatewayRef, amountPaisa, raw: body };
    }
  }
}

/** eSewa sends 100, 100.0 and "1,000.0" for amounts. Reduce them all to at most 2 decimals. */
function normaliseAmount(value: number | string) {
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isNaN(number) ? String(value) : number.toFixed(2);
}
