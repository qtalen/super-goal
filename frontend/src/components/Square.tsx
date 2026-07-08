import type { ReactNode } from 'react';
import Piece from './Piece';

export interface SquareProps {
  square: string;
  piece: string | null;
  isLight: boolean;
  isSelected: boolean;
  isLegalMove: boolean;
  isLastMove: boolean;
  isCheck: boolean;
  onClick: () => void;
  children?: ReactNode;
}

function Square({
  square = '',
  piece = null,
  isLight = true,
  isSelected = false,
  isLegalMove = false,
  isLastMove = false,
  isCheck = false,
  onClick = () => {},
  children,
}: SquareProps) {
  const classNames = [
    'square',
    isLight ? 'square--light' : 'square--dark',
    isSelected ? 'square--selected' : '',
    isLegalMove ? (piece ? 'square--legal-capture' : 'square--legal-move') : '',
    isLastMove ? 'square--last-move' : '',
    isCheck ? 'square--check' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const ariaLabel = square || (isLight ? 'light square' : 'dark square');

  return (
    <div
      className={classNames}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={ariaLabel}
    >
      {piece ? <Piece type={piece} /> : null}
      {children}
    </div>
  );
}

export default Square;
