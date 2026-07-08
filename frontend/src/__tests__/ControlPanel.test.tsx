import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ControlPanel from '../components/ControlPanel';

const defaultProps = {
  difficulty: 2 as const,
  onNewGame: vi.fn(),
  onUndo: vi.fn(),
  canUndo: false,
  isThinking: false,
};

describe('ControlPanel', () => {
  it('renders difficulty label', () => {
    render(<ControlPanel {...defaultProps} />);
    expect(screen.getByLabelText('难度选择：')).toBeInTheDocument();
  });

  it('renders difficulty select with 3 options', () => {
    render(<ControlPanel {...defaultProps} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(select.children).toHaveLength(3);
  });

  it('has default difficulty set to 中级 (value 2)', () => {
    render(<ControlPanel {...defaultProps} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('2');
  });

  it('renders difficulty options with correct values', () => {
    render(<ControlPanel {...defaultProps} />);
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveValue('1');
    expect(options[0]).toHaveTextContent('初级');
    expect(options[1]).toHaveValue('2');
    expect(options[1]).toHaveTextContent('中级');
    expect(options[2]).toHaveValue('3');
    expect(options[2]).toHaveTextContent('高级');
  });

  it('renders new game button', () => {
    render(<ControlPanel {...defaultProps} />);
    expect(screen.getByText('新游戏')).toBeInTheDocument();
  });

  it('renders undo button', () => {
    render(<ControlPanel {...defaultProps} />);
    expect(screen.getByText('悔棋')).toBeInTheDocument();
  });

  it('both buttons are type button', () => {
    render(<ControlPanel {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn).toHaveAttribute('type', 'button');
    });
  });

  // 新游戏按钮回调：传入当前 selectedDifficulty
  it('calls onNewGame with selected difficulty when new game button is clicked', () => {
    const onNewGame = vi.fn();
    render(<ControlPanel {...defaultProps} onNewGame={onNewGame} difficulty={2} />);
    fireEvent.click(screen.getByText('新游戏'));
    expect(onNewGame).toHaveBeenCalledWith(2);
  });

  // 新游戏按钮回调：切换难度后再点击
  it('calls onNewGame with updated difficulty after changing selection', () => {
    const onNewGame = vi.fn();
    render(<ControlPanel {...defaultProps} onNewGame={onNewGame} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '3' } });
    fireEvent.click(screen.getByText('新游戏'));
    expect(onNewGame).toHaveBeenCalledWith(3);
  });

  // 悔棋按钮禁用状态
  it('disables undo button when canUndo is false', () => {
    render(<ControlPanel {...defaultProps} canUndo={false} />);
    expect(screen.getByText('悔棋')).toBeDisabled();
  });

  it('enables undo button when canUndo is true', () => {
    render(<ControlPanel {...defaultProps} canUndo={true} />);
    expect(screen.getByText('悔棋')).not.toBeDisabled();
  });

  // 悔棋按钮在思考时禁用
  it('disables buttons when isThinking is true', () => {
    render(<ControlPanel {...defaultProps} isThinking={true} canUndo={true} />);
    expect(screen.getByText('新游戏')).toBeDisabled();
    expect(screen.getByText('悔棋')).toBeDisabled();
  });

  // 选择器在思考时禁用
  it('disables select when isThinking is true', () => {
    render(<ControlPanel {...defaultProps} isThinking={true} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  // 思考指示器
  it('shows thinking indicator when isThinking is true', () => {
    render(<ControlPanel {...defaultProps} isThinking={true} />);
    expect(screen.getByText('AI 思考中...')).toBeInTheDocument();
  });

  it('hides thinking indicator when isThinking is false', () => {
    render(<ControlPanel {...defaultProps} isThinking={false} />);
    expect(screen.queryByText('AI 思考中...')).not.toBeInTheDocument();
  });

  // 边缘情况：onUndo 被调用
  it('calls onUndo when undo button is clicked', () => {
    const onUndo = vi.fn();
    render(<ControlPanel {...defaultProps} onUndo={onUndo} canUndo={true} />);
    fireEvent.click(screen.getByText('悔棋'));
    expect(onUndo).toHaveBeenCalled();
  });

  // 边缘情况：undo 按钮在 canUndo=false 时不可点击
  it('does not call onUndo when cannot undo', () => {
    const onUndo = vi.fn();
    render(<ControlPanel {...defaultProps} onUndo={onUndo} canUndo={false} />);
    fireEvent.click(screen.getByText('悔棋'));
    expect(onUndo).not.toHaveBeenCalled();
  });
});
