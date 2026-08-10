import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    course: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn() }));
vi.mock('@/lib/confirmationEmail', () => ({ buildConfirmationEmailHtml: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { sendMail } from '@/lib/mailer';
import { buildConfirmationEmailHtml } from '@/lib/confirmationEmail';
import { sendPurchaseConfirmation } from './purchaseEmail';
import { CourseType } from '@/domain/courseType';

const prismaMock = prisma as unknown as {
  purchase: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  course: { findMany: ReturnType<typeof vi.fn> };
};
const mockSendMail = sendMail as unknown as ReturnType<typeof vi.fn>;
const mockBuildHtml = buildConfirmationEmailHtml as unknown as ReturnType<typeof vi.fn>;

const PURCHASE_ID = 'p1';
const USER = 'u-1';
const CORE = { id: 'course-core', title: 'Base', type: CourseType.core, week: 0, price: 0 };
const ELECTIVE = {
  id: 'course-elective',
  title: 'Electivo',
  type: CourseType.elective,
  week: 2,
  price: 25900,
};

const PURCHASE = { id: PURCHASE_ID, userId: USER, coursesIds: [ELECTIVE.id] };

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildHtml.mockReturnValue('<p>receipt</p>');
  mockSendMail.mockResolvedValue(undefined);
});

describe('sendPurchaseConfirmation', () => {
  it('resolves the recipient from the purchase owner and mails the built receipt', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PURCHASE);
    prismaMock.user.findUnique.mockResolvedValue({ id: USER, email: 'buyer@uc.cl' });
    prismaMock.course.findMany
      .mockResolvedValueOnce([CORE]) // core courses
      .mockResolvedValueOnce([ELECTIVE]); // purchased courses

    await sendPurchaseConfirmation(PURCHASE_ID);

    expect(prismaMock.purchase.findUnique).toHaveBeenCalledWith({ where: { id: PURCHASE_ID } });
    // The address is never an argument — it is derived from the purchase's own owner.
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: USER } });
    expect(mockSendMail).toHaveBeenCalledWith(
      'buyer@uc.cl',
      'Confirmación de compra',
      '<p>receipt</p>',
    );
  });

  it('builds the receipt from the purchased courses PLUS every core course', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PURCHASE);
    prismaMock.user.findUnique.mockResolvedValue({ id: USER, email: 'buyer@uc.cl' });
    prismaMock.course.findMany
      .mockResolvedValueOnce([CORE])
      .mockResolvedValueOnce([ELECTIVE]);

    await sendPurchaseConfirmation(PURCHASE_ID);

    expect(prismaMock.course.findMany).toHaveBeenNthCalledWith(1, {
      where: { type: CourseType.core },
    });
    expect(prismaMock.course.findMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: [ELECTIVE.id] } },
    });
    expect(mockBuildHtml).toHaveBeenCalledWith({
      id: PURCHASE_ID,
      courses: [CORE, ELECTIVE],
      user: { id: USER, email: 'buyer@uc.cl' },
    });
  });

  it('de-duplicates a core course that was also explicitly purchased', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ ...PURCHASE, coursesIds: [CORE.id, ELECTIVE.id] });
    prismaMock.user.findUnique.mockResolvedValue({ id: USER, email: 'buyer@uc.cl' });
    prismaMock.course.findMany
      .mockResolvedValueOnce([CORE])
      .mockResolvedValueOnce([CORE, ELECTIVE]); // core also appears among the purchased rows

    await sendPurchaseConfirmation(PURCHASE_ID);

    expect(mockBuildHtml).toHaveBeenCalledWith({
      id: PURCHASE_ID,
      courses: [CORE, ELECTIVE],
      user: { id: USER, email: 'buyer@uc.cl' },
    });
  });

  it('throws "Purchase not found" without sending when the purchase is missing', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(null);

    await expect(sendPurchaseConfirmation(PURCHASE_ID)).rejects.toThrow('Purchase not found');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('throws "Purchase owner has no email" without sending when the owner row is missing', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PURCHASE);
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(sendPurchaseConfirmation(PURCHASE_ID)).rejects.toThrow(
      'Purchase owner has no email',
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('throws "Purchase owner has no email" without sending when the email is blank', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PURCHASE);
    prismaMock.user.findUnique.mockResolvedValue({ id: USER, email: '' });

    await expect(sendPurchaseConfirmation(PURCHASE_ID)).rejects.toThrow(
      'Purchase owner has no email',
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('propagates a transport failure to the caller', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PURCHASE);
    prismaMock.user.findUnique.mockResolvedValue({ id: USER, email: 'buyer@uc.cl' });
    prismaMock.course.findMany.mockResolvedValue([]);
    mockSendMail.mockRejectedValue(new Error('smtp down'));

    await expect(sendPurchaseConfirmation(PURCHASE_ID)).rejects.toThrow('smtp down');
  });
});
