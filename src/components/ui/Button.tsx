import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function Button({ variant = 'primary', className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`digid-btn digid-btn--${variant}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}
