import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { createUser, getUsers } from './users';

beforeEach(() => {
  vi.clearAllMocks();
});

const validInput = {
  names: 'Juan',
  lastNames: 'Pérez',
  rut: '11111111-1',
  email: 'juan@uc.cl',
  university: 'Universidad de Chile',
  carrerYear: 3,
};

describe('createUser', () => {
  it('returns the existing user (ok) when one with the same rut exists', async () => {
    const existing = { id: 'u1', ...validInput };
    (prisma.user.findUnique as any).mockResolvedValue(existing);

    const res = await createUser(validInput);

    expect(res).toEqual({ ok: true, data: existing });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { rut: validInput.rut } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates and returns the user (ok) when the rut is new', async () => {
    const created = { id: 'u2', ...validInput };
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue(created);

    const res = await createUser(validInput);

    expect(res).toEqual({ ok: true, data: created });
    expect(prisma.user.create).toHaveBeenCalledWith({ data: validInput });
  });

  it('fails 400 on Zod validation error (missing names) without hitting prisma', async () => {
    const res = await createUser({ ...validInput, names: '' });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.field).toBe('names');
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('fails 409 with field=email on a Prisma P2002 unique violation', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });

    const res = await createUser(validInput);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.field).toBe('email');
    }
  });

  it('fails 400 with field=rut when the RUT check digit is invalid', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    const res = await createUser({ ...validInput, rut: '11111111-9' });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.field).toBe('rut');
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('getUsers', () => {
  it('returns all users', async () => {
    const users = [{ id: 'u1', ...validInput }, { id: 'u2', ...validInput }];
    (prisma.user.findMany as any).mockResolvedValue(users);

    const res = await getUsers();

    expect(res).toEqual({ ok: true, data: users });
    expect(prisma.user.findMany).toHaveBeenCalledWith();
  });

  it('returns empty array when no users exist', async () => {
    (prisma.user.findMany as any).mockResolvedValue([]);

    const res = await getUsers();

    expect(res).toEqual({ ok: true, data: [] });
  });
});
