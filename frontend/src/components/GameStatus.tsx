import '../styles/GameStatus.scss';

export interface GameStatusProps {
  turn?: 'w' | 'b';
  status?: string;
  difficulty?: number;
}

const STATUS_LABELS: Record<string, string> = {
  playing: '进行中',
  check: '将军',
  checkmate: '将杀',
  stalemate: '逼和',
  draw: '和棋',
};

function getStatusText(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function GameStatus({
  turn = 'w',
  status = 'playing',
  difficulty = 2,
}: GameStatusProps) {
  const turnText = turn === 'w' ? '白方走' : '黑方走';
  const statusText = getStatusText(status);

  const difficultyLabels: Record<number, string> = {
    1: '初级',
    2: '中级',
    3: '高级',
  };
  const difficultyText = difficultyLabels[difficulty] ?? String(difficulty);

  return (
    <div className="game-status">
      <h2>游戏状态</h2>
      <p className="game-status__turn">回合：{turnText}</p>
      <p className="game-status__state">状态：{statusText}</p>
      <p className="game-status__difficulty">难度：{difficultyText}</p>
    </div>
  );
}

export default GameStatus;
