const UNICODE_MAP: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

interface PieceProps {
  type: string | null | undefined;
}

function Piece({ type }: PieceProps) {
  if (!type) {
    return null;
  }

  const char = UNICODE_MAP[type];

  if (!char) {
    return null;
  }

  const color = type === type.toUpperCase() ? 'white' : 'black';

  return (
    <span className={`piece piece--${color}`} aria-label={`${color} ${type.toLowerCase()}`}>
      {char}
    </span>
  );
}

export default Piece;
