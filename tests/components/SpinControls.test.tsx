import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpinControls from '@/components/SpinControls';

vi.mock('framer-motion', () => ({
  motion: {
    button: ({
      children,
      onClick,
      disabled,
      ...props
    }: React.PropsWithChildren<{
      onClick?: () => void;
      disabled?: boolean;
    }>) => (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
  },
}));

describe('SpinControls', () => {
  it('shows empty pool message when disabled with empty_pool reason', () => {
    render(
      <SpinControls
        onSpin={vi.fn()}
        loading={false}
        disabled
        disabledReason="empty_pool"
      />
    );
    expect(screen.getByText(/No items match your current filters/i)).toBeInTheDocument();
  });

  it('shows library selection hint when no library selected', () => {
    render(
      <SpinControls onSpin={vi.fn()} loading={false} disabled disabledReason="no_library" />
    );
    expect(screen.getByText(/Select at least one library/i)).toBeInTheDocument();
  });

  it('calls onSpin when enabled and clicked', async () => {
    const onSpin = vi.fn();
    const user = userEvent.setup();
    render(
      <SpinControls onSpin={onSpin} loading={false} disabled={false} poolCount={42} />
    );
    await user.click(screen.getByRole('button', { name: /SPIN!/i }));
    expect(onSpin).toHaveBeenCalledOnce();
  });

  it('shows pool count when enabled', () => {
    render(
      <SpinControls onSpin={vi.fn()} loading={false} disabled={false} poolCount={42} />
    );
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/items in pool/i)).toBeInTheDocument();
  });
});
