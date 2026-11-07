import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnimatedValue, ProgressRing } from './motion';
import { SegmentedTabs } from './ui/segmented-tabs';

describe('AnimatedValue', () => {
  it('gives screen readers the final value straight away', () => {
    const { container } = render(<AnimatedValue value="3.62" />);
    expect(container.querySelector('.sr-only')).toHaveTextContent('3.62');
    expect(container.querySelector('[aria-hidden]')).toBeInTheDocument();
  });

  it('keeps decimals and the percent sign', () => {
    const { container } = render(<AnimatedValue value="84.25%" />);
    expect(container.querySelector('.sr-only')).toHaveTextContent('84.25%');
  });

  it('shows anything that is not a plain number as it is', () => {
    render(<AnimatedValue value="Rs. 1,000.00" />);
    expect(screen.getByText('Rs. 1,000.00')).toBeInTheDocument();
  });

  it('reaches the real value in the end', async () => {
    const { container } = render(<AnimatedValue value={40} />);
    await vi.waitFor(
      () => expect(container.querySelector('[aria-hidden]')).toHaveTextContent('40'),
      { timeout: 3000 },
    );
  });
});

describe('ProgressRing', () => {
  it('reports its value to assistive technology', () => {
    render(<ProgressRing percent={68} label="DBMS attendance" />);
    const ring = screen.getByRole('progressbar', { name: 'DBMS attendance' });
    expect(ring).toHaveAttribute('aria-valuenow', '68');
  });

  it('puts the required mark where the ring reaches that level', () => {
    const { container } = render(<ProgressRing percent={89} label="DBMS" markAt={75} />);
    const ring = container.querySelector('circle:last-of-type');
    const mark = container.querySelector('line');
    // An SVG circle's stroke starts at 3 o'clock and runs clockwise. The mark must start there too.
    expect(ring).toHaveAttribute('cx', '32');
    expect(mark).toHaveAttribute('y1', '32');
    expect(mark).toHaveAttribute('y2', '32');
    expect(Number(mark?.getAttribute('x1'))).toBeGreaterThan(32);
    expect(mark).toHaveAttribute('transform', 'rotate(270 32 32)');
  });

  it('has no value yet when there are no classes', () => {
    render(<ProgressRing percent={null} label="DBMS attendance" />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
});

describe('SegmentedTabs', () => {
  const TABS = [
    { value: 'a', label: 'First' },
    { value: 'b', label: 'Second' },
    { value: 'c', label: 'Third' },
  ];

  function Example() {
    const [value, setValue] = useState('a');
    return <SegmentedTabs label="Example" tabs={TABS} value={value} onChange={setValue} />;
  }

  it('is one tab stop, on the chosen tab', () => {
    render(<Example />);
    const [first, second] = screen.getAllByRole('tab');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
  });

  it('chooses a tab when clicked', async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'false');
  });

  it('moves with the arrow keys, wrapping at the ends', async () => {
    render(<Example />);
    screen.getByRole('tab', { name: 'First' }).focus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus();
  });

  it('jumps with Home and End', async () => {
    render(<Example />);
    screen.getByRole('tab', { name: 'First' }).focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus();
  });
});
