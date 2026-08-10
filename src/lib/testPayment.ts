// Operator-only escape hatch that quotes a purchase at a token amount so the
// PRODUCTION payment path can be exercised end to end — real card, real commit,
// real enrolment, real receipt — without charging a real price.
//
// Dormant unless PAYMENT_TEST_CODE is set in the environment. Unsetting that
// variable removes the mechanism entirely: no code path can reach the test amount,
// so "off" is the absence of a secret rather than a flag someone could flip.
//
// A plain lib rather than part of the action: keeping the comparison isolated is
// what lets it be tested against near-miss codes without standing up Prisma.
import { timingSafeEqual } from 'node:crypto';

const DEFAULT_TEST_AMOUNT_CLP = 50;

/**
 * The amount a test purchase is quoted at.
 *
 * Anything that is not a positive integer collapses to the default. That matters
 * more than it looks: the quoted amount is frozen into Purchase.amount before the
 * redirect, and webpayConfirm.amountsMatch compares it to Transbank's committed
 * amount with Number.isInteger on both sides. A NaN or fractional value there
 * would make the row unsettleable AFTER the card had been charged.
 */
export function testPaymentAmountClp(): number {
  const configured = process.env.PAYMENT_TEST_AMOUNT_CLP;
  if (!configured) return DEFAULT_TEST_AMOUNT_CLP;
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_TEST_AMOUNT_CLP;
  return parsed;
}

/**
 * Constant-time equality against the configured secret.
 *
 * The truthiness guard on `secret` runs FIRST and is the load-bearing line: a
 * deploy that sets PAYMENT_TEST_CODE to an empty string must not be satisfiable
 * by a caller who also sends an empty string, which is exactly what an absent
 * `?testCode=` query param degrades to.
 *
 * Lengths are compared before timingSafeEqual because it throws on mismatched
 * buffer lengths. That leaks the secret's length, which is not a useful fact to
 * an attacker who still has to guess the contents.
 */
function matchesTestCode(supplied: string | undefined): boolean {
  const secret = process.env.PAYMENT_TEST_CODE;
  if (!secret || !supplied) return false;

  const expected = Buffer.from(secret, 'utf8');
  const actual = Buffer.from(supplied, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Resolve what a purchase should be quoted at: the token test amount when the
 * caller proved knowledge of the operator secret, otherwise the real price.
 *
 * Returning the full price is the default for every failure mode — unset secret,
 * absent code, wrong code, blank either side — so the only way to reach the test
 * amount is an exact match against a secret that is actually configured.
 */
export function resolveTestPaymentAmount(fullPrice: number, testCode?: string): number {
  return matchesTestCode(testCode) ? testPaymentAmountClp() : fullPrice;
}
