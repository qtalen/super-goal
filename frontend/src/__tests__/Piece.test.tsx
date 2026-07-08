import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Piece from '../components/Piece';

describe('Piece', () => {
  // 正常情况：所有 6 种白棋和黑棋类型
  it('renders white king (K)', () => {
    render(<Piece type="K" />);
    expect(screen.getByText('♔')).toBeInTheDocument();
  });

  it('renders white queen (Q)', () => {
    render(<Piece type="Q" />);
    expect(screen.getByText('♕')).toBeInTheDocument();
  });

  it('renders white rook (R)', () => {
    render(<Piece type="R" />);
    expect(screen.getByText('♖')).toBeInTheDocument();
  });

  it('renders white bishop (B)', () => {
    render(<Piece type="B" />);
    expect(screen.getByText('♗')).toBeInTheDocument();
  });

  it('renders white knight (N)', () => {
    render(<Piece type="N" />);
    expect(screen.getByText('♘')).toBeInTheDocument();
  });

  it('renders white pawn (P)', () => {
    render(<Piece type="P" />);
    expect(screen.getByText('♙')).toBeInTheDocument();
  });

  it('renders black king (k)', () => {
    render(<Piece type="k" />);
    expect(screen.getByText('♚')).toBeInTheDocument();
  });

  it('renders black queen (q)', () => {
    render(<Piece type="q" />);
    expect(screen.getByText('♛')).toBeInTheDocument();
  });

  it('renders black rook (r)', () => {
    render(<Piece type="r" />);
    expect(screen.getByText('♜')).toBeInTheDocument();
  });

  it('renders black bishop (b)', () => {
    render(<Piece type="b" />);
    expect(screen.getByText('♝')).toBeInTheDocument();
  });

  it('renders black knight (n)', () => {
    render(<Piece type="n" />);
    expect(screen.getByText('♞')).toBeInTheDocument();
  });

  it('renders black pawn (p)', () => {
    render(<Piece type="p" />);
    expect(screen.getByText('♟')).toBeInTheDocument();
  });

  // 边缘情况：空输入
  it('returns null when type is null', () => {
    const { container } = render(<Piece type={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when type is undefined', () => {
    const { container } = render(<Piece type={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when type is empty string', () => {
    const { container } = render(<Piece type="" />);
    expect(container.firstChild).toBeNull();
  });

  // 边缘情况：非法输入
  it('returns null for invalid piece type', () => {
    const { container } = render(<Piece type="X" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for lowercase invalid type', () => {
    const { container } = render(<Piece type="z" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for numeric type', () => {
    const { container } = render(<Piece type="1" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for multi-char type', () => {
    const { container } = render(<Piece type="KK" />);
    expect(container.firstChild).toBeNull();
  });

  // 样式和可访问性
  it('applies white piece CSS class', () => {
    render(<Piece type="K" />);
    const span = screen.getByText('♔');
    expect(span.className).toContain('piece--white');
  });

  it('applies black piece CSS class', () => {
    render(<Piece type="k" />);
    const span = screen.getByText('♚');
    expect(span.className).toContain('piece--black');
  });

  it('has accessible aria-label for white piece', () => {
    render(<Piece type="K" />);
    expect(screen.getByLabelText('white k')).toBeInTheDocument();
  });

  it('has accessible aria-label for black piece', () => {
    render(<Piece type="k" />);
    expect(screen.getByLabelText('black k')).toBeInTheDocument();
  });
});
