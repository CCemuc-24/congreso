import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BuyInfo from './buyInfo';
import type { Course, User } from '@prisma/client';

const user = {
  id: 'u1', names: 'Ada', lastNames: 'Lovelace', rut: '11.111.111-1',
  email: 'ada@example.com', university: 'UC', carrerYear: 3,
  createdAt: new Date(), updatedAt: new Date(),
} as User;

// 2026 bundle: general (core) + chosen module (elective, carries the ticket price) + 2 workshops.
const courses = [
  { id: 'g0', title: 'Módulo General', module: 1, type: 'core', price: 0, capacity: 1000, features: null, week: 0, topics: [], createdAt: new Date(), updatedAt: new Date() },
  { id: 'm1', title: 'Módulo Ginecología', module: 4, type: 'elective', price: 25900, capacity: 1000, features: null, week: 1, topics: [], createdAt: new Date(), updatedAt: new Date() },
  { id: 'w1', title: 'Workshop Suturas', module: 6, type: 'workshop', price: 0, capacity: 20, features: null, week: 3, topics: [], createdAt: new Date(), updatedAt: new Date() },
  { id: 'w2', title: 'Workshop RCP avanzado', module: 7, type: 'workshop', price: 0, capacity: 20, features: null, week: 3, topics: [], createdAt: new Date(), updatedAt: new Date() },
] as unknown as Course[];

describe('BuyInfo', () => {
  it('shows loading when user is null', () => {
    render(<BuyInfo courses={courses} user={null} />);
    expect(screen.getByText('Cargando...')).toBeTruthy();
  });

  it('shows loading when courses are empty', () => {
    render(<BuyInfo courses={[]} user={user} />);
    expect(screen.getByText('Cargando...')).toBeTruthy();
  });

  it('renders the general module, chosen module, workshops, ticket price and user details', () => {
    render(<BuyInfo courses={courses} user={user} />);
    expect(screen.getByText('Módulo General')).toBeTruthy();
    expect(screen.getByText('Módulo Ginecología')).toBeTruthy();
    expect(screen.getByText('Workshop Suturas')).toBeTruthy();
    expect(screen.getByText('Workshop RCP avanzado')).toBeTruthy();
    expect(screen.getByText('$25900')).toBeTruthy(); // ticket price rides on the module
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('11.111.111-1')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
  });
});
