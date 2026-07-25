import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Stepper } from './Stepper';
import { Modal } from './Modal';
import { Toast } from './Toast';
import { Spinner } from './Spinner';

describe('Button', () => {
  it('dispara onClick y respeta disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Continuar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<Button onClick={onClick} disabled>Continuar</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('Stepper', () => {
  it('marca el paso activo con aria-current', () => {
    render(<Stepper steps={['A', 'B', 'C']} active={1} />);
    expect(screen.getByText('B').closest('[aria-current]')).toBeTruthy();
  });
});

describe('Modal', () => {
  it('renderiza con role dialog y cierra con Escape', async () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><p>contenido</p></Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('atrapa el foco: Tab desde el último botón vuelve al primero', async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <button>Primero</button>
        <button>Último</button>
      </Modal>
    );
    const last = screen.getByRole('button', { name: 'Último' });
    const first = screen.getByRole('button', { name: 'Primero' });
    last.focus();
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
  });
});

describe('Toast', () => {
  it('usa role alert para errores', () => {
    render(<Toast kind="error" message="algo falló" />);
    expect(screen.getByRole('alert')).toHaveTextContent('algo falló');
  });

  it('usa role status para éxito', () => {
    render(<Toast kind="success" message="listo" />);
    expect(screen.getByRole('status')).toHaveTextContent('listo');
  });
});

describe('Spinner', () => {
  it('renderiza con role progressbar', () => {
    render(<Spinner />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
