import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameStatus from '../components/GameStatus';

describe('GameStatus', () => {
  it('renders heading', () => {
    render(<GameStatus />);
    expect(screen.getByText('游戏状态')).toBeInTheDocument();
  });

  it('renders turn indicator for white', () => {
    render(<GameStatus turn="w" />);
    expect(screen.getByText('回合：白方走')).toBeInTheDocument();
  });

  it('renders turn indicator for black', () => {
    render(<GameStatus turn="b" />);
    expect(screen.getByText('回合：黑方走')).toBeInTheDocument();
  });

  it('renders state as playing by default', () => {
    render(<GameStatus />);
    expect(screen.getByText('状态：进行中')).toBeInTheDocument();
  });

  it('renders check state', () => {
    render(<GameStatus status="check" />);
    expect(screen.getByText('状态：将军')).toBeInTheDocument();
  });

  it('renders checkmate state', () => {
    render(<GameStatus status="checkmate" />);
    expect(screen.getByText('状态：将杀')).toBeInTheDocument();
  });

  it('renders stalemate state', () => {
    render(<GameStatus status="stalemate" />);
    expect(screen.getByText('状态：逼和')).toBeInTheDocument();
  });

  it('renders draw state', () => {
    render(<GameStatus status="draw" />);
    expect(screen.getByText('状态：和棋')).toBeInTheDocument();
  });

  it('renders difficulty level', () => {
    render(<GameStatus difficulty={2} />);
    expect(screen.getByText('难度：中级')).toBeInTheDocument();
  });

  it('renders all difficulty labels', () => {
    const { rerender } = render(<GameStatus difficulty={1} />);
    expect(screen.getByText('难度：初级')).toBeInTheDocument();
    rerender(<GameStatus difficulty={3} />);
    expect(screen.getByText('难度：高级')).toBeInTheDocument();
  });

  it('renders all three info lines', () => {
    render(<GameStatus />);
    // 三个 <p> 元素分别对应回合、状态、难度
    const paragraphs = screen.getAllByRole('paragraph');
    expect(paragraphs).toHaveLength(3);
  });

  // 边缘情况：未知状态
  it('renders unknown status as-is', () => {
    render(<GameStatus status="custom_status" />);
    expect(screen.getByText('状态：custom_status')).toBeInTheDocument();
  });

  // 边缘情况：未知难度
  it('renders unknown difficulty as number', () => {
    render(<GameStatus difficulty={99} />);
    expect(screen.getByText('难度：99')).toBeInTheDocument();
  });
});
