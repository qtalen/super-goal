import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameStatus from '../components/GameStatus';

describe('GameStatus', () => {
  it('renders heading', () => {
    render(<GameStatus />);
    expect(screen.getByText('Game Status')).toBeInTheDocument();
  });

  it('renders turn indicator for white', () => {
    render(<GameStatus turn="w" />);
    expect(screen.getByText("White's turn")).toBeInTheDocument();
  });

  it('renders turn indicator for black', () => {
    render(<GameStatus turn="b" />);
    expect(screen.getByText("Black's turn")).toBeInTheDocument();
  });

  it('renders state as playing by default', () => {
    render(<GameStatus />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders check state', () => {
    render(<GameStatus status="check" />);
    expect(screen.getByText('Check')).toBeInTheDocument();
  });

  it('renders checkmate state', () => {
    render(<GameStatus status="checkmate" />);
    expect(screen.getByText('Checkmate!')).toBeInTheDocument();
  });

  it('renders stalemate state', () => {
    render(<GameStatus status="stalemate" />);
    expect(screen.getByText('Stalemate')).toBeInTheDocument();
  });

  it('renders draw state', () => {
    render(<GameStatus status="draw" />);
    expect(screen.getByText('Draw')).toBeInTheDocument();
  });

  it('renders difficulty level', () => {
    render(<GameStatus difficulty={2} />);
    expect(screen.getByText('Difficulty: Intermediate')).toBeInTheDocument();
  });

  it('renders all difficulty labels', () => {
    const { rerender } = render(<GameStatus difficulty={1} />);
    expect(screen.getByText('Difficulty: Beginner')).toBeInTheDocument();
    rerender(<GameStatus difficulty={3} />);
    expect(screen.getByText('Difficulty: Advanced')).toBeInTheDocument();
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
    expect(screen.getByText('custom_status')).toBeInTheDocument();
  });

  // 边缘情况：未知难度
  it('renders unknown difficulty as number', () => {
    render(<GameStatus difficulty={99} />);
    expect(screen.getByText('Difficulty: 99')).toBeInTheDocument();
  });
});
