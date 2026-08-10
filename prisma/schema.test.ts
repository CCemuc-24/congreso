import { describe, it, expect } from 'vitest';
import type { User, Course, Purchase, Enrollment } from '@prisma/client';
import { CourseType, Prisma } from '@prisma/client';
// A VALUE import, not `import type`: @prisma/client exports PaymentStatus both as
// a runtime object and as the type derived from it, and the runtime object is what
// makes the assertion below execute rather than merely compile.
import { PaymentStatus as PrismaPaymentStatus } from '@prisma/client';
import { PaymentStatus, paymentStatusValues } from '../src/domain/paymentStatus';

// Most of this file is type-level assertions: if the schema or the generated client
// is missing a field, it fails to COMPILE. That is enforced by `npm run typecheck`
// (tsc --noEmit) and by `next build` — NOT by `npm run test`. Vitest transforms TS
// with esbuild, which strips types without checking them, so a type-only assertion
// here can never fail a test run. Anything that must hold under `npm run test`
// needs a runtime assertion, as the PaymentStatus case below has.

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
    // Compared against the RUNTIME enum object Prisma generates, so this executes
    // under Vitest. The previous version asserted only `IsExactly<…> = true` and
    // `toHaveLength(6)` on a literal the test itself wrote: Vitest's esbuild
    // transform strips types without checking them, so nothing ran and adding a
    // seventh domain member left the file at 3/3 passing. Both directions are
    // covered — a member on either side alone breaks the toEqual.
    const prismaMembers = Object.keys(PrismaPaymentStatus).sort();
    expect(Object.keys(PaymentStatus).sort()).toEqual(prismaMembers);
    // The parallel `paymentStatusValues` array (used for zod enums) has to track the
    // same list, and had no test of its own at all.
    expect([...paymentStatusValues].sort()).toEqual(prismaMembers);
    // Every key maps to itself, as a Postgres enum does — so the values are checked
    // too, not just the member names.
    expect(Object.values(PaymentStatus)).toEqual(Object.keys(PaymentStatus));
    expect(prismaMembers).toHaveLength(6);

    // Kept alongside the runtime check, not replaced by it: this catches type-level
    // drift the runtime cannot see. If the two enums diverge in either direction,
    // `IsExactly<…>` resolves to `false` and assigning `true` to it stops this file
    // from compiling. Only `npm run typecheck` enforces it — see the note above.
    const typesMatch: IsExactly<PaymentStatus, PrismaPaymentStatus> = true;
    expect(typesMatch).toBe(true);
  });
});
