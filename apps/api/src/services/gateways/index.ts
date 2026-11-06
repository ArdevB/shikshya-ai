import { env } from '../../config/env.js';
import { EsewaGateway } from './esewa.js';
import { KhaltiGateway } from './khalti.js';
import type { PaymentGateway } from './types.js';

const gateways = { ESEWA: new EsewaGateway(), KHALTI: new KhaltiGateway() };

export type GatewayName = keyof typeof gateways;

export const gatewayFor = (name: GatewayName): PaymentGateway => gateways[name];

export const isGatewayName = (value: string): value is GatewayName => value in gateways;

/** So the payment screen can say a gateway is unavailable, rather than fail when it is chosen. */
export const availableGateways = () => ({
  ESEWA: true,
  KHALTI: Boolean(env.KHALTI_SECRET_KEY),
});
