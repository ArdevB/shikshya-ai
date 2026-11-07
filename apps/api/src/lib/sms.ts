import { logger } from './logger.js';

/**
 * The seam for a Nepali SMS gateway. Nothing sends real SMS yet: a provider can be plugged in
 * later by implementing this interface.
 */
export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

export class ConsoleSmsProvider implements SmsProvider {
  async send(phone: string, message: string) {
    logger.info({ phone, message }, 'SMS not sent: no provider set up');
  }
}

export const smsProvider: SmsProvider = new ConsoleSmsProvider();
