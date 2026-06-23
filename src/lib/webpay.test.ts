import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const optionsSpy = vi.fn();
const txInstance = { create: vi.fn(), commit: vi.fn() };
const txSpy = vi.fn(() => txInstance);

vi.mock('transbank-sdk', () => {
  class Options {
    constructor(public commerceCode: string, public apiKey: string, public environment: string) {
      optionsSpy(commerceCode, apiKey, environment);
    }
  }
  class Transaction {
    constructor(public options: Options) {
      txSpy(options);
      // Return txInstance so callers get the shared spy object
      return txInstance as unknown as Transaction;
    }
    create = txInstance.create;
    commit = txInstance.commit;
  }
  return {
    WebpayPlus: { Transaction },
    Options,
    Environment: { Production: 'PRODUCTION', Integration: 'INTEGRATION' },
    IntegrationApiKeys: { WEBPAY: 'int-api-key-default' },
    IntegrationCommerceCodes: { WEBPAY_PLUS: '597055555532' },
  };
});

describe('getWebpayTransaction', () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WEBPAY_ENVIRONMENT;
    delete process.env.WEBPAY_COMMERCE_CODE;
    delete process.env.WEBPAY_API_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('uses Production env with provided commerce code + api key when WEBPAY_ENVIRONMENT=production', async () => {
    process.env.WEBPAY_ENVIRONMENT = 'production';
    process.env.WEBPAY_COMMERCE_CODE = 'prod-cc';
    process.env.WEBPAY_API_KEY = 'prod-key';
    const { getWebpayTransaction } = await import('./webpay');
    getWebpayTransaction();
    expect(optionsSpy).toHaveBeenCalledWith('prod-cc', 'prod-key', 'PRODUCTION');
  });

  it('uses Integration env and SDK integration defaults when WEBPAY_ENVIRONMENT unset and creds unset', async () => {
    const { getWebpayTransaction } = await import('./webpay');
    getWebpayTransaction();
    expect(optionsSpy).toHaveBeenCalledWith('597055555532', 'int-api-key-default', 'INTEGRATION');
  });

  it('uses Integration env with provided creds when WEBPAY_ENVIRONMENT=integration and creds set', async () => {
    process.env.WEBPAY_ENVIRONMENT = 'integration';
    process.env.WEBPAY_COMMERCE_CODE = 'int-cc';
    process.env.WEBPAY_API_KEY = 'int-key';
    const { getWebpayTransaction } = await import('./webpay');
    getWebpayTransaction();
    expect(optionsSpy).toHaveBeenCalledWith('int-cc', 'int-key', 'INTEGRATION');
  });

  it('returns a Transaction built from the Options', async () => {
    const { getWebpayTransaction } = await import('./webpay');
    const tx = getWebpayTransaction();
    expect(txSpy).toHaveBeenCalledOnce();
    expect(tx).toBe(txInstance);
  });
});

describe('createWebpayTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WEBPAY_ENVIRONMENT;
  });

  it('forwards buyOrder, sessionId, amount, returnUrl to transaction.create and returns its response', async () => {
    txInstance.create.mockResolvedValueOnce({ token: 'tok-123', url: 'https://webpay/redirect' });
    const { createWebpayTransaction } = await import('./webpay');
    const res = await createWebpayTransaction('BO-1', 'user-1', 45000, 'https://app/return?purchaseId=p1');
    expect(txInstance.create).toHaveBeenCalledWith('BO-1', 'user-1', 45000, 'https://app/return?purchaseId=p1');
    expect(res).toEqual({ token: 'tok-123', url: 'https://webpay/redirect' });
  });
});

describe('commitWebpayTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WEBPAY_ENVIRONMENT;
  });

  it('returns the committed transaction status on success', async () => {
    txInstance.commit.mockResolvedValueOnce({ status: 'AUTHORIZED', amount: 45000 });
    const { commitWebpayTransaction } = await import('./webpay');
    const res = await commitWebpayTransaction('tok-ws');
    expect(txInstance.commit).toHaveBeenCalledWith('tok-ws');
    expect(res).toEqual({ status: 'AUTHORIZED', amount: 45000 });
  });

  it('returns { status: "ERROR", error } when commit throws (no rethrow)', async () => {
    const boom = new Error('Transbank down');
    txInstance.commit.mockRejectedValueOnce(boom);
    const { commitWebpayTransaction } = await import('./webpay');
    const res = await commitWebpayTransaction('tok-ws');
    expect(res).toEqual({ status: 'ERROR', error: boom });
  });
});
