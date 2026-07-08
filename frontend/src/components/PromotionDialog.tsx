import type { ReactNode } from 'react';

export interface PromotionDialogProps {
  color: 'w' | 'b';
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

const PIECES: { type: 'q' | 'r' | 'b' | 'n'; label: string; char: string }[] = [
  { type: 'q', label: '后', char: '♕' },
  { type: 'r', label: '车', char: '♖' },
  { type: 'b', label: '象', char: '♗' },
  { type: 'n', label: '马', char: '♘' },
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
      aria-label="升变选择"
      onClick={onCancel}
    >
      <div
        className="promotion-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="promotion-dialog__title">升变 — 选择棋子</h3>
        <p className="promotion-dialog__hint">
          {color === 'w' ? '白方' : '黑方'}兵到达底线，请选择升变棋子：
        </p>
        <div className="promotion-dialog__buttons">
          {PIECES.map(({ type, label, char }) => (
            <button
              key={type}
              className="promotion-dialog__btn"
              type="button"
              onClick={() => onSelect(type)}
              aria-label={`升变为${label}`}
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
          取消走子
        </button>
      </div>
    </div>
  );
}

export default PromotionDialog;
