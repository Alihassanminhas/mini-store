import Stripe from 'stripe';
import { env } from '../config/env.js';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe test payments are not configured yet.'), { statusCode: 503 });
  if (!env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    throw Object.assign(new Error('This store accepts Stripe test keys only.'), { statusCode: 503 });
  }
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}
