import 'server-only';
import type { CowpayCallback } from '@/domain/cowpay';

// Manual operator review, not network verification. No SQL-literal URL or provider key is reused.
export function cowpayCallback(
  env: Record<string, string | undefined> = process.env,
): CowpayCallback {
  if (env.ICARE_COWPAY_CALLBACK_REVIEWED !== 'true') return { state: 'pending', url: null };
  try {
    const value = env.ICARE_COWPAY_CALLBACK_URL ?? '',
      url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      value.length > 2048 ||
      /[\r\n]/.test(value)
    )
      throw new Error();
    return { state: 'reviewed', url: url.href };
  } catch {
    return { state: 'invalid', url: null };
  }
}
