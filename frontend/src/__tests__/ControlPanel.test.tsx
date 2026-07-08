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
    expect(screen.getByLabelText('Difficulty:')).toBeInTheDocument();
  });

  it('renders difficulty select with 3 options', () => {
    render(<ControlPanel {...defaultProps} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(select.children).toHaveLength(3);
  });

  it('has default difficulty set to Intermediate (value 2)', () => {
    render(<ControlPanel {...defaultProps} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('2');
  });

  it('renders difficulty options with correct values', () => {
    render(<ControlPanel {...defaultProps} />);
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveValue('1');
    expect(options[0]).toHaveTextContent('Beginner');
    expect(options[1]).toHaveValue('2');
    expect(options[1]).toHaveTextContent('Intermediate');
    expect(options[2]).toHaveValue('3');
    expect(options[2]).toHaveTextContent('Advanced');
  });

  it('renders new game button', () => {
    render(<ControlPanel {...defaultProps} />);
    expect(screen.getByText('New Game')).toBeInTheDocument();
  });

  it('renders undo button', () => {
    render(<ControlPanel {...defaultProps} />);
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('calls onNewGame when new game button is clicked', () => {
    const onNewGame = vi.fn();
    render(<ControlPanel {...defaultProps} onNewGame={onNewGame} />);
    fireEvent.click(screen.getByText('New Game'));
    expect(onNewGame).toHaveBeenCalledWith(2);
  });

  it('calls onNewGame with updated difficulty after switching', () => {
    const onNewGame = vi.fn();
    render(<ControlPanel {...defaultProps} onNewGame={onNewGame} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '3' } });
    fireEvent.click(screen.getByText('New Game'));
    expect(onNewGame).toHaveBeenCalledWith(3);
  });

  it('disables undo button when canUndo is false', () => {
    render(<ControlPanel {...defaultProps} canUndo={false} />);
    expect(screen.getByText('Undo')).toBeDisabled();
  });

  it('enables undo button when canUndo is true', () => {
    render(<ControlPanel {...defaultProps} canUndo={true} />);
    expect(screen.getByText('Undo')).not.toBeDisabled();
  });

  it('disables buttons when isThinking is true', () => {
    render(<ControlPanel {...defaultProps} isThinking={true} />);
    expect(screen.getByText('New Game')).toBeDisabled();
    expect(screen.getByText('Undo')).toBeDisabled();
  });

  it('disables select when isThinking is true', () => {
    render(<ControlPanel {...defaultProps} isThinking={true} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('shows thinking indicator when isThinking is true', () => {
    render(<ControlPanel {...defaultProps} isThinking={true} />);
    expect(screen.getByText('AI thinking...')).toBeInTheDocument();
  });

  it('hides thinking indicator when isThinking is false', () => {
    render(<ControlPanel {...defaultProps} isThinking={false} />);
    expect(screen.queryByText('AI thinking...')).not.toBeInTheDocument();
  });

  it('calls onUndo when undo button is clicked', () => {
    const onUndo = vi.fn();
    render(<ControlPanel {...defaultProps} onUndo={onUndo} canUndo={true} />);
    fireEvent.click(screen.getByText('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('does not call onUndo when cannot undo', () => {
    const onUndo = vi.fn();
    render(<ControlPanel {...defaultProps} onUndo={onUndo} canUndo={false} />);
    fireEvent.click(screen.getByText('Undo'));
    expect(onUndo).not.toHaveBeenCalled();
  });
});
