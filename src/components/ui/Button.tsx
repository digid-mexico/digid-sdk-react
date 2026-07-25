import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function Button({ variant = 'primary', className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`digid-btn digid-btn--${variant}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}
