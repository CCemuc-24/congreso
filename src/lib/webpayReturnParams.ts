// Transbank returns the browser to our returnUrl via a form-encoded POST, and
// re-issues a GET on some abort paths. Both FormData and URLSearchParams expose
// .get(key), so one parser covers both. Kept pure and separate from the Route
// Handler so the four-case dispatch in webpayConfirm.ts is testable without HTTP.
export type WebpayReturnParams = {
  token_ws?: string;
  TBK_TOKEN?: string;
  TBK_ORDEN_COMPRA?: string;
  TBK_ID_SESION?: string;
  /** Our own round-tripped id. Display-only — never used to select the row to settle. */
  purchaseId?: string;
};

export function extractReturnParams(src: FormData | URLSearchParams): WebpayReturnParams {
  // Empty string collapses to undefined: the dispatch branches on presence, so a
  // blank value must not read as "the key arrived".
  const get = (key: string): string | undefined => {
    const value = src.get(key);
    if (value == null) return undefined;
    const text = String(value);
    return text === '' ? undefined : text;
  };

  return {
    token_ws: get('token_ws'),
    TBK_TOKEN: get('TBK_TOKEN'),
    TBK_ORDEN_COMPRA: get('TBK_ORDEN_COMPRA'),
    TBK_ID_SESION: get('TBK_ID_SESION'),
    purchaseId: get('purchaseId'),
  };
}
