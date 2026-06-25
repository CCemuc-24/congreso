import { describe, it, expect, vi } from 'vitest';
import { CourseType } from '@prisma/client';
import { seedCourses } from './seed';

function makeFakeClient(existingCount = 0) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    course: {
      count: vi.fn(async () => existingCount),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `id-${created.length}`, ...data };
      }),
    },
  };
}

describe('seedCourses', () => {
  it('creates the CCEM UC 2026 catalog: 1 general + 3 modules + 10 workshops', async () => {
    const client = makeFakeClient(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await seedCourses(client as any);

    expect(client.course.create).toHaveBeenCalledTimes(14);
    expect(client.created).toHaveLength(14);

    // type distribution: 1 core (general), 3 elective (sync modules), 10 workshop
    const types = client.created.map((c) => c.type);
    expect(types.filter((t) => t === CourseType.core)).toHaveLength(1);
    expect(types.filter((t) => t === CourseType.elective)).toHaveLength(3);
    expect(types.filter((t) => t === CourseType.workshop)).toHaveLength(10);

    // General module — core, week 0, auto-included
    const general = client.created.find((c) => c.type === CourseType.core)!;
    expect(general.title).toBe('Módulo General: Cirugía en pacientes complejos');
    expect(general.week).toBe(0);

    // The three synchronous modules a student chooses between — the $25.900
    // ticket price rides on the chosen module.
    const titles = client.created.map((c) => c.title);
    expect(titles).toContain('Módulo: Ginecología y Obstetricia');
    expect(titles).toContain('Módulo: Cirugía Digestiva y Coloproctología');
    expect(titles).toContain('Módulo: Cirugía Vascular');
    const electives = client.created.filter((c) => c.type === CourseType.elective);
    expect(electives.every((m) => m.price === 25900)).toBe(true);

    // Workshops are capacity-limited (20) and presential on 24/10
    const workshops = client.created.filter((c) => c.type === CourseType.workshop);
    expect(workshops).toHaveLength(10);
    expect(workshops.every((w) => w.capacity === 20)).toBe(true);
    expect(workshops.every((w) => w.week === 3)).toBe(true);
    expect(titles).toContain('Workshop: Suturas');
    expect(titles).toContain('Workshop: Accesos venosos');

    // Card images stay within the 8 available (cards/1..8.png)
    expect(client.created.every((c) => (c.module as number) >= 1 && (c.module as number) <= 8)).toBe(true);

    // No orphan 2024 courses
    expect(titles).not.toContain('Curso de prueba');
    expect(titles).not.toContain('Módulo: Anestesiología');
  });

  it('is idempotent — skips creation when courses already exist', async () => {
    const client = makeFakeClient(14);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await seedCourses(client as any);
    expect(client.course.create).not.toHaveBeenCalled();
  });
});
