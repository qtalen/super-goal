import '../styles/GameStatus.scss';

export interface GameStatusProps {
  turn?: 'w' | 'b';
  status?: string;
  difficulty?: number;
}

const STATUS_LABELS: Record<string, string> = {
  playing: 'In Progress',
  check: 'Check',
  checkmate: 'Checkmate!',
  stalemate: 'Stalemate',
  draw: 'Draw',
};

function getStatusText(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function GameStatus({
  turn = 'w',
  status = 'playing',
  difficulty = 2,
}: GameStatusProps) {
  const turnText = turn === 'w' ? "White's turn" : "Black's turn";
  const statusText = getStatusText(status);

  const difficultyLabels: Record<number, string> = {
    1: 'Beginner',
    2: 'Intermediate',
    3: 'Advanced',
  };
  const difficultyText = difficultyLabels[difficulty] ?? String(difficulty);

  return (
    <div className="game-status">
      <h2>Game Status</h2>
      <p className="game-status__turn">{turnText}</p>
      <p className="game-status__state">{statusText}</p>
      <p className="game-status__difficulty">Difficulty: {difficultyText}</p>
    </div>
  );
}

export default GameStatus;
