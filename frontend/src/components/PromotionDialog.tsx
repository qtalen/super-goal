import type { ReactNode } from 'react';

export interface PromotionDialogProps {
  color: 'w' | 'b';
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

const PIECES: { type: 'q' | 'r' | 'b' | 'n'; label: string; char: string }[] = [
  { type: 'q', label: 'Queen', char: '♕' },
  { type: 'r', label: 'Rook', char: '♖' },
  { type: 'b', label: 'Bishop', char: '♗' },
  { type: 'n', label: 'Knight', char: '♘' },
];

function PromotionDialog({
  color = 'w',
  onSelect,
  onCancel,
}: PromotionDialogProps) {
  return (
    <div
      className="promotion-overlay"
      role="dialog"
      aria-label="Promotion"
      onClick={onCancel}
    >
      <div
        className="promotion-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="promotion-dialog__title">Promotion</h3>
        <p className="promotion-dialog__hint">
          {color === 'w' ? 'White' : 'Black'} pawn reached the last rank. Choose a piece:
        </p>
        <div className="promotion-dialog__buttons">
          {PIECES.map(({ type, label, char }) => (
            <button
              key={type}
              className="promotion-dialog__btn"
              type="button"
              onClick={() => onSelect(type)}
              aria-label={`Promote to ${label}`}
            >
              <span
                className={`promotion-dialog__piece promotion-dialog__piece--${color}`}
              >
                {char}
              </span>
              <span className="promotion-dialog__label">{label}</span>
            </button>
          ))}
        </div>
        <button
          className="promotion-dialog__cancel"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default PromotionDialog;
