import {
  WebpayPlus,
  Options,
  Environment,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
} from 'transbank-sdk';

/**
 * Build a configured WebpayPlus.Transaction from env.
 * WEBPAY_ENVIRONMENT=production -> Environment.Production with WEBPAY_COMMERCE_CODE / WEBPAY_API_KEY.
 * Otherwise -> Environment.Integration, defaulting to the SDK's integration test creds when unset.
 */
export function getWebpayTransaction(): WebpayPlus.Transaction {
  const isProduction = process.env.WEBPAY_ENVIRONMENT === 'production';

  const commerceCode = isProduction
    ? (process.env.WEBPAY_COMMERCE_CODE ?? '')
    : (process.env.WEBPAY_COMMERCE_CODE ?? IntegrationCommerceCodes.WEBPAY_PLUS);

  const apiKey = isProduction
    ? (process.env.WEBPAY_API_KEY ?? '')
    : (process.env.WEBPAY_API_KEY ?? IntegrationApiKeys.WEBPAY);

  const environment = isProduction ? Environment.Production : Environment.Integration;

  return new WebpayPlus.Transaction(new Options(commerceCode, apiKey, environment));
}

/** Create a Webpay Plus transaction. Returns the gateway { token, url } to redirect the user. */
export async function createWebpayTransaction(
  buyOrder: string,
  sessionId: string,
  amount: number,
  returnUrl: string,
): Promise<{ token: string; url: string }> {
  const transaction = getWebpayTransaction();
  return transaction.create(buyOrder, sessionId, amount, returnUrl);
}

/**
 * Commit a Webpay Plus transaction by token.
 * Mirrors the legacy confirmWebPayToken contract: on SDK throw, resolve with
 * { status: 'ERROR', error } instead of rejecting, so callers branch on status.
 */
export async function commitWebpayTransaction(
  tokenWs: string,
): Promise<{ status: string; [k: string]: unknown }> {
  try {
    const transaction = getWebpayTransaction();
    return await transaction.commit(tokenWs);
  } catch (error) {
    return { status: 'ERROR', error };
  }
}
