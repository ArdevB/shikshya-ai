import { EsewaGateway } from './esewa.js';
import { KhaltiGateway } from './khalti.js';
import type { PaymentGateway } from './types.js';

const gateways = { ESEWA: new EsewaGateway(), KHALTI: new KhaltiGateway() };

export type GatewayName = keyof typeof gateways;

export const gatewayFor = (name: GatewayName): PaymentGateway => gateways[name];

export const isGatewayName = (value: string): value is GatewayName => value in gateways;
