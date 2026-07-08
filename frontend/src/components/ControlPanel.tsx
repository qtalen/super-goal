import { useState } from 'react';
import '../styles/ControlPanel.scss';

interface ControlPanelProps {
  difficulty: 1 | 2 | 3;
  onNewGame: (difficulty: 1 | 2 | 3) => void;
  onUndo: () => void;
  canUndo: boolean;
  isThinking: boolean;
}

function ControlPanel({ difficulty, onNewGame, onUndo, canUndo, isThinking }: ControlPanelProps) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<1 | 2 | 3>(difficulty);

  const handleDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDifficulty(parseInt(e.target.value) as 1 | 2 | 3);
  };

  const handleNewGame = () => {
    onNewGame(selectedDifficulty);
  };

  return (
    <div className="control-panel">
      <div className="control-panel__section">
        <label htmlFor="difficulty-select">难度选择：</label>
        <select
          id="difficulty-select"
          value={selectedDifficulty}
          onChange={handleDifficultyChange}
          disabled={isThinking}
        >
          <option value={1}>初级</option>
          <option value={2}>中级</option>
          <option value={3}>高级</option>
        </select>
      </div>
      <div className="control-panel__buttons">
        <button
          className="control-panel__btn control-panel__btn--new-game"
          type="button"
          onClick={handleNewGame}
          disabled={isThinking}
        >
          新游戏
        </button>
        <button
          className="control-panel__btn control-panel__btn--undo"
          type="button"
          onClick={onUndo}
          disabled={!canUndo || isThinking}
        >
          悔棋
        </button>
      </div>
      {isThinking && (
        <div className="control-panel__thinking">
          <span className="control-panel__spinner" />
          AI 思考中...
        </div>
      )}
    </div>
  );
}

export default ControlPanel;
