import Razorpay from 'razorpay';
import { env } from './env';

let _rzp: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  }
  if (!_rzp) {
    _rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return _rzp;
}

export function isBillingEnabled(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID) && !env.LAN_MODE;
}
