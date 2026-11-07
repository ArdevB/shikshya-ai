import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

const show = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

describe('HomePage', () => {
  it('has one main heading and a way to log in', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const links = screen.getAllByRole('link', { name: /log in/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/login');
  });

  it('says the demo is made up, so nobody takes it for a real college', () => {
    show();
    expect(screen.getByText(/made up/i)).toBeInTheDocument();
  });
});
