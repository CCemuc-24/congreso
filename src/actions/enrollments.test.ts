import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    enrollment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  assertAdmin: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { prisma } from '@/lib/prisma';
import { assertAdmin, UnauthorizedError } from '@/lib/auth';
import {
  createEnrollment,
  getEnrollments,
  getEnrollmentById,
  updateEnrollment,
  deleteEnrollment,
} from './enrollments';

const mockPrisma = prisma as unknown as {
  enrollment: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};
const mockAssertAdmin = assertAdmin as unknown as ReturnType<typeof vi.fn>;

const validInput = {
  userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  courseId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  purchaseId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
};
const dbEnrollment = { id: 'e-1', ...validInput };

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertAdmin.mockReturnValue(undefined);
});

describe('createEnrollment', () => {
  it('returns the existing enrollment without creating (find-or-return)', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue(dbEnrollment);
    const res = await createEnrollment(validInput);
    expect(mockPrisma.enrollment.findUnique).toHaveBeenCalledWith({
      where: { UserCourseUnique: { userId: validInput.userId, courseId: validInput.courseId } },
    });
    expect(mockPrisma.enrollment.create).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, data: dbEnrollment });
  });

  it('creates a new enrollment when none exists', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue(null);
    mockPrisma.enrollment.create.mockResolvedValue(dbEnrollment);
    const res = await createEnrollment(validInput);
    expect(mockPrisma.enrollment.create).toHaveBeenCalledWith({ data: validInput });
    expect(res).toEqual({ ok: true, data: dbEnrollment });
  });

  it('returns 400 with field on invalid Zod input', async () => {
    const res = await createEnrollment({ ...validInput, userId: '' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.field).toBe('userId');
    }
    expect(mockPrisma.enrollment.findUnique).not.toHaveBeenCalled();
  });

  it('maps a P2002 unique-constraint race to 409 with field', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue(null);
    const err = Object.assign(new Error('unique'), {
      code: 'P2002',
      meta: { target: ['userId', 'courseId'] },
    });
    mockPrisma.enrollment.create.mockRejectedValue(err);
    const res = await createEnrollment(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.field).toBe('userId');
    }
  });

  it('returns 400 on a generic prisma error', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue(null);
    mockPrisma.enrollment.create.mockRejectedValue(new Error('db down'));
    const res = await createEnrollment(validInput);
    expect(res).toEqual({ ok: false, error: 'db down', status: 400 });
  });
});

describe('getEnrollments', () => {
  it('returns all enrollments', async () => {
    mockPrisma.enrollment.findMany.mockResolvedValue([dbEnrollment]);
    const res = await getEnrollments();
    expect(res).toEqual({ ok: true, data: [dbEnrollment] });
  });

  it('returns 500 when prisma throws', async () => {
    mockPrisma.enrollment.findMany.mockRejectedValue(new Error('boom'));
    const res = await getEnrollments();
    expect(res).toEqual({ ok: false, error: 'boom', status: 500 });
  });
});

describe('getEnrollmentById', () => {
  it('returns the enrollment when found', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue(dbEnrollment);
    const res = await getEnrollmentById('e-1');
    expect(mockPrisma.enrollment.findUnique).toHaveBeenCalledWith({ where: { id: 'e-1' } });
    expect(res).toEqual({ ok: true, data: dbEnrollment });
  });

  it('returns 404 when not found', async () => {
    mockPrisma.enrollment.findUnique.mockResolvedValue(null);
    const res = await getEnrollmentById('nope');
    expect(res).toEqual({ ok: false, error: 'Enrollment not found', status: 404 });
  });
});

describe('updateEnrollment', () => {
  it('rejects when admin secret is invalid', async () => {
    mockAssertAdmin.mockImplementation(() => {
      throw new UnauthorizedError('Unauthorized');
    });
    const res = await updateEnrollment('e-1', validInput, 'wrong');
    expect(res).toEqual({ ok: false, error: 'Unauthorized', status: 403 });
    expect(mockPrisma.enrollment.update).not.toHaveBeenCalled();
  });

  it('updates and returns the enrollment', async () => {
    const newPurchaseId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const updated = { ...dbEnrollment, purchaseId: newPurchaseId };
    mockPrisma.enrollment.update.mockResolvedValue(updated);
    const res = await updateEnrollment('e-1', { ...validInput, purchaseId: newPurchaseId }, 'right');
    expect(mockPrisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e-1' },
      data: { ...validInput, purchaseId: newPurchaseId },
    });
    expect(res).toEqual({ ok: true, data: updated });
  });

  it('returns 404 when the enrollment does not exist', async () => {
    const err = Object.assign(new Error('not found'), { code: 'P2025' });
    mockPrisma.enrollment.update.mockRejectedValue(err);
    const res = await updateEnrollment('nope', validInput, 'right');
    expect(res).toEqual({ ok: false, error: 'Enrollment not found', status: 404 });
  });
});

describe('deleteEnrollment', () => {
  it('rejects when admin secret is invalid', async () => {
    mockAssertAdmin.mockImplementation(() => {
      throw new UnauthorizedError('Unauthorized');
    });
    const res = await deleteEnrollment('e-1', 'wrong');
    expect(res).toEqual({ ok: false, error: 'Unauthorized', status: 403 });
    expect(mockPrisma.enrollment.delete).not.toHaveBeenCalled();
  });

  it('deletes and returns null data', async () => {
    mockPrisma.enrollment.delete.mockResolvedValue(dbEnrollment);
    const res = await deleteEnrollment('e-1', 'right');
    expect(mockPrisma.enrollment.delete).toHaveBeenCalledWith({ where: { id: 'e-1' } });
    expect(res).toEqual({ ok: true, data: null });
  });

  it('returns 404 when the enrollment does not exist', async () => {
    const err = Object.assign(new Error('not found'), { code: 'P2025' });
    mockPrisma.enrollment.delete.mockRejectedValue(err);
    const res = await deleteEnrollment('nope', 'right');
    expect(res).toEqual({ ok: false, error: 'Enrollment not found', status: 404 });
  });
});
