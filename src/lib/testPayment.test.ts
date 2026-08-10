import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveTestPaymentAmount, testPaymentAmountClp } from '@/lib/testPayment';

const FULL_PRICE = 25900;
const SECRET = 'a-long-random-operator-only-secret';

describe('resolveTestPaymentAmount', () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    delete process.env.PAYMENT_TEST_CODE;
    delete process.env.PAYMENT_TEST_AMOUNT_CLP;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  // The dormancy guarantee: with the env var absent the mechanism must be
  // unreachable no matter what the client sends, including a literal 'undefined'
  // or an empty string, which are what a query param degrades to in practice.
  it('is dormant when PAYMENT_TEST_CODE is unset, whatever the client sends', () => {
    for (const supplied of [undefined, '', 'undefined', SECRET, 'anything']) {
      expect(resolveTestPaymentAmount(FULL_PRICE, supplied)).toBe(FULL_PRICE);
    }
  });

  // The dangerous pairing: an env var set to '' must not be satisfied by a caller
  // sending ''. Guarding on the secret's truthiness BEFORE comparing is what
  // prevents an accidentally-blank deploy from selling every course for 50 pesos.
  it('does not match an empty supplied code against an empty configured secret', () => {
    process.env.PAYMENT_TEST_CODE = '';
    expect(resolveTestPaymentAmount(FULL_PRICE, '')).toBe(FULL_PRICE);
    expect(resolveTestPaymentAmount(FULL_PRICE, undefined)).toBe(FULL_PRICE);
  });

  it('charges the test amount when the supplied code matches exactly', () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    expect(resolveTestPaymentAmount(FULL_PRICE, SECRET)).toBe(50);
  });

  it('charges full price for a wrong code, including near-misses', () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    for (const wrong of [
      undefined,
      '',
      SECRET.slice(0, -1), // prefix — would pass a startsWith comparison
      SECRET + 'x', // extension — would pass a startsWith comparison
      SECRET.toUpperCase(),
      ' ' + SECRET,
    ]) {
      expect(resolveTestPaymentAmount(FULL_PRICE, wrong)).toBe(FULL_PRICE);
    }
  });

  it('honours PAYMENT_TEST_AMOUNT_CLP when it is a positive integer', () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    process.env.PAYMENT_TEST_AMOUNT_CLP = '1000';
    expect(resolveTestPaymentAmount(FULL_PRICE, SECRET)).toBe(1000);
  });

  // webpayConfirm.amountsMatch compares integers strictly and fails closed on NaN,
  // so a garbage amount frozen into the row would make the purchase unsettleable
  // AFTER the card was charged. Falling back to the documented default keeps the
  // row settleable instead of stranding a real payment.
  it('falls back to 50 when PAYMENT_TEST_AMOUNT_CLP is not a positive integer', () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    for (const bad of ['abc', '', '0', '-100', '50.5', 'Infinity']) {
      process.env.PAYMENT_TEST_AMOUNT_CLP = bad;
      expect(resolveTestPaymentAmount(FULL_PRICE, SECRET)).toBe(50);
    }
  });
});

describe('testPaymentAmountClp', () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('defaults to 50 CLP, the Webpay Plus minimum', () => {
    delete process.env.PAYMENT_TEST_AMOUNT_CLP;
    expect(testPaymentAmountClp()).toBe(50);
  });
});
