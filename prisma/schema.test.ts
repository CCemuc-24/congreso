import { describe, it, expect } from 'vitest';
import type { User, Course, Purchase, Enrollment } from '@prisma/client';
import { CourseType, Prisma } from '@prisma/client';
import type { PaymentStatus as PrismaPaymentStatus } from '@prisma/client';
import { PaymentStatus } from '../src/domain/paymentStatus';

// These are type-level assertions compiled by Vitest's esbuild/tsc pipeline.
// If the schema/generated client is missing a field, this file fails to compile.

// Mutual type-equality check. A plain `const x: Wide[] = narrow` only checks
// one direction (a narrower union is always assignable into a wider one), so
// it silently passes if the Prisma enum gains a member the domain enum
// lacks — verified by temporarily adding a 7th Prisma member and observing
// that assignment still compiled.
//
// The direct generic-constraint form `type AssertEqual<A extends B, B
// extends A> = true` is NOT valid TypeScript for this: it reports TS2313
// ("Type parameter 'A' has a circular constraint") on the declaration itself,
// unconditionally — confirmed with `tsc --noEmit` even when the two enums
// are perfectly in sync, so it can't be the mechanism here. Wrapping each
// side in a covariant function-type position blocks TS's usual member-wise
// distribution over unions and gives a real two-way equality check instead:
type IsExactly<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

describe('prisma generated types', () => {
  it('CourseType enum has core/elective/workshop', () => {
    expect(CourseType.core).toBe('core');
    expect(CourseType.elective).toBe('elective');
    expect(CourseType.workshop).toBe('workshop');
  });

  it('models expose the mirrored fields', () => {
    const user: Pick<User, 'names' | 'lastNames' | 'rut' | 'email' | 'university' | 'carrerYear'> = {
      names: 'a', lastNames: 'b', rut: '1-9', email: 'e', university: 'u', carrerYear: 1,
    };
    const course: Pick<Course, 'title' | 'module' | 'type' | 'price' | 'capacity' | 'week' | 'topics'> = {
      title: 't', module: 1, type: CourseType.core, price: 0, capacity: 10, week: 0, topics: [],
    };
    const purchase: Pick<
      Purchase,
      'userId' | 'buyOrder' | 'isPaid' | 'coursesIds' | 'status' | 'amount' | 'token' | 'authorizationCode' | 'paymentTypeCode' | 'paidAt'
    > = {
      userId: 'u', buyOrder: 'b', isPaid: false, coursesIds: [],
      status: 'PENDING', amount: 25900, token: null,
      authorizationCode: null, paymentTypeCode: null, paidAt: null,
    };
    const enrollment: Pick<Enrollment, 'userId' | 'courseId' | 'purchaseId'> = {
      userId: 'u', courseId: 'c', purchaseId: 'p',
    };
    // features is a nullable Json column on Course
    const features: Prisma.InputJsonValue = { Modalidad: 'on-line' };

    expect(user.carrerYear).toBe(1);
    expect(course.type).toBe('core');
    expect(purchase.isPaid).toBe(false);
    expect(enrollment.courseId).toBe('c');
    expect(features).toBeTruthy();
  });

  it('PaymentStatus domain enum matches the generated Prisma enum', () => {
    const all: PaymentStatus[] = [
      PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.REJECTED,
      PaymentStatus.ABORTED, PaymentStatus.TIMEOUT, PaymentStatus.ERROR,
    ];
    // The real assertion is the type, not the runtime check: if the domain
    // enum and the generated Prisma enum drift in either direction,
    // `IsExactly<...>` resolves to `false` and assigning `true` to it stops
    // this file from compiling (checked via `tsc --noEmit`, since Vitest's
    // esbuild transform strips types without checking them — see note below).
    const typesMatch: IsExactly<PaymentStatus, PrismaPaymentStatus> = true;
    expect(typesMatch).toBe(true);
    expect(all).toHaveLength(6);
  });
});
