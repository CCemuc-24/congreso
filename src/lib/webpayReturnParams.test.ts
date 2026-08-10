import { describe, it, expect } from 'vitest';
import { extractReturnParams } from './webpayReturnParams';

describe('extractReturnParams', () => {
  it('reads every known key from FormData (the POST return)', () => {
    const fd = new FormData();
    fd.set('token_ws', 'tok-abc');
    fd.set('TBK_TOKEN', 'tbk-1');
    fd.set('TBK_ORDEN_COMPRA', 'order-1');
    fd.set('TBK_ID_SESION', 'sess-1');
    fd.set('purchaseId', 'pur-1');

    expect(extractReturnParams(fd)).toEqual({
      token_ws: 'tok-abc',
      TBK_TOKEN: 'tbk-1',
      TBK_ORDEN_COMPRA: 'order-1',
      TBK_ID_SESION: 'sess-1',
      purchaseId: 'pur-1',
    });
  });

  it('reads the same keys from URLSearchParams (the GET return)', () => {
    const qs = new URLSearchParams('token_ws=tok-get&purchaseId=pur-2');
    expect(extractReturnParams(qs)).toEqual({
      token_ws: 'tok-get',
      TBK_TOKEN: undefined,
      TBK_ORDEN_COMPRA: undefined,
      TBK_ID_SESION: undefined,
      purchaseId: 'pur-2',
    });
  });

  it('maps absent keys to undefined, not empty string', () => {
    // The four-case dispatch branches on presence, so "" and undefined must not blur.
    const params = extractReturnParams(new URLSearchParams(''));
    expect(params.token_ws).toBeUndefined();
    expect(params.TBK_TOKEN).toBeUndefined();
  });

  it('treats an explicitly empty value as absent', () => {
    // The old handler could emit `purchaseId=`; an empty token must not read as present.
    const params = extractReturnParams(new URLSearchParams('token_ws=&purchaseId='));
    expect(params.token_ws).toBeUndefined();
    expect(params.purchaseId).toBeUndefined();
  });
});
