/**
 * One interface for both gateways, so the payment service never needs to know which is in use.
 * Adding a gateway means writing one class and registering it in gateways/index.ts.
 */

export interface InitiateInput {
  paymentId: string;
  amountPaisa: number;
  purchaseName: string;
  /** Where the gateway sends the customer afterwards. */
  successUrl: string;
  failureUrl: string;
  websiteUrl: string;
  customer: { name: string; email: string; phone: string | null };
}

export interface InitiateOutput {
  /** Go to this page (Khalti). */
  redirectUrl?: string;
  /** Or POST these fields to this URL (eSewa). */
  formAction?: string;
  formFields?: Record<string, string>;
  /** The gateway's own reference, kept to verify the payment later. */
  gatewayRef?: string;
}

export interface VerifyInput {
  id: string;
  amountPaisa: number;
  gatewayRef: string | null;
}

export interface VerifyResult {
  /**
   * SUCCESS: the gateway confirms the money was paid.
   * FAILED: the gateway confirms it was not (cancelled, expired or refunded).
   * PENDING: not known yet, including when the gateway cannot be reached. Hold and check later.
   */
  state: 'SUCCESS' | 'FAILED' | 'PENDING';
  gatewayRef: string | null;
  /** What the gateway says was paid. The service compares this with what was expected. */
  amountPaisa: number | null;
  raw: unknown;
}

export interface PaymentGateway {
  initiate(input: InitiateInput): Promise<InitiateOutput>;
  /** Finds which payment a browser redirect is about, or null if the redirect is not genuine. */
  identifyCallback(params: Record<string, unknown>): string | null;
  /**
   * Asks the gateway directly, server to server. It deliberately takes no callback data:
   * anything in a redirect URL can be forged by the person in front of the browser.
   */
  verify(payment: VerifyInput): Promise<VerifyResult>;
}
