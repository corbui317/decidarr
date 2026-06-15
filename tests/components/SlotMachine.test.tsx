import { vi, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SlotMachine from '@/components/SlotMachine';

vi.mock('framer-motion', () => ({
  motion: {
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
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

describe('SlotMachine', () => {
  it('shows empty pool message when disabled with empty_pool reason', () => {
    render(
      <SlotMachine
        onSpin={vi.fn()}
        spinning={false}
        disabled
        disabledReason="empty_pool"
      />
    );
    expect(screen.getByText(/No items match your current filters/i)).toBeInTheDocument();
  });

  it('shows library selection hint when no library selected', () => {
    render(
      <SlotMachine onSpin={vi.fn()} spinning={false} disabled disabledReason="no_library" />
    );
    expect(screen.getByText(/Select at least one library/i)).toBeInTheDocument();
  });

  it('calls onSpin when enabled and clicked', async () => {
    const onSpin = vi.fn();
    const user = userEvent.setup();
    render(
      <SlotMachine onSpin={onSpin} spinning={false} disabled={false} poolCount={42} />
    );
    await user.click(screen.getByRole('button', { name: /SPIN!/i }));
    expect(onSpin).toHaveBeenCalledOnce();
  });

  it('shows pool count when enabled', () => {
    render(
      <SlotMachine onSpin={vi.fn()} spinning={false} disabled={false} poolCount={42} />
    );
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/items in pool/i)).toBeInTheDocument();
  });
});
