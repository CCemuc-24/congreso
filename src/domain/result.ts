// src/domain/result.ts
export type ActionOk<T> = { ok: true; data: T };
export type ActionErr = { ok: false; error: string; field?: string; status: number };
export type ActionResult<T> = ActionOk<T> | ActionErr;

export const ok = <T>(data: T): ActionOk<T> => ({ ok: true, data });

export const fail = (error: string, status = 400, field?: string): ActionErr =>
  field === undefined
    ? { ok: false, error, status }
    : { ok: false, error, status, field };
