import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Square from '../components/Square';

const baseProps = {
  square: 'a1',
  piece: null,
  isLight: true,
  isSelected: false,
  isLegalMove: false,
  isLastMove: false,
  isCheck: false,
  onClick: vi.fn(),
};

describe('Square', () => {
  // Normal case
  it('renders light square with isLight=true', () => {
    render(<Square {...baseProps} isLight />);
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--light');
  });

  it('renders dark square with isLight=false', () => {
    render(<Square {...baseProps} isLight={false} />);
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--dark');
  });

  it('has accessible aria-label with square name', () => {
    render(<Square {...baseProps} square="e4" />);
    expect(screen.getByLabelText('e4')).toBeInTheDocument();
  });

  // Selected state
  it('applies selected class when isSelected is true', () => {
    render(<Square {...baseProps} isSelected />);
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--selected');
  });

  it('does not apply selected class when isSelected is false', () => {
    render(<Square {...baseProps} isSelected={false} />);
    const square = screen.getByRole('button');
    expect(square.className).not.toContain('square--selected');
  });

  // Legal move marking
  it('applies legal-move class when isLegalMove is true and no piece', () => {
    render(<Square {...baseProps} isLegalMove piece={null} />);
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--legal-move');
    expect(square.className).not.toContain('square--legal-capture');
  });

  it('applies legal-capture class when isLegalMove is true and has piece', () => {
    render(<Square {...baseProps} isLegalMove piece="p" />);
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--legal-capture');
  });

  it('does not apply legal-move class when isLegalMove is false', () => {
    render(<Square {...baseProps} isLegalMove={false} />);
    const square = screen.getByRole('button');
    expect(square.className).not.toContain('square--legal-move');
  });

  // Last move highlight
  it('applies last-move class when isLastMove is true', () => {
    render(<Square {...baseProps} isLastMove />);
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--last-move');
  });

  it('does not apply last-move class when isLastMove is false', () => {
    render(<Square {...baseProps} isLastMove={false} />);
    const square = screen.getByRole('button');
    expect(square.className).not.toContain('square--last-move');
  });

  // Check flashing
  it('applies check class when isCheck is true', () => {
    render(<Square {...baseProps} isCheck />);
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--check');
  });

  it('does not apply check class when isCheck is false', () => {
    render(<Square {...baseProps} isCheck={false} />);
    const square = screen.getByRole('button');
    expect(square.className).not.toContain('square--check');
  });

  // Piece rendering
  it('renders piece component when piece prop is provided', () => {
    render(<Square {...baseProps} piece="K" />);
    expect(screen.getByText('♔')).toBeInTheDocument();
  });

  it('does not render piece when piece prop is null', () => {
    const { container } = render(<Square {...baseProps} piece={null} />);
    // Piece component renders span.piece, returns null when type is null
    const pieceSpans = container.querySelectorAll('.piece');
    expect(pieceSpans).toHaveLength(0);
  });

  it('renders children when provided', () => {
    render(
      <Square {...baseProps}>
        <span data-testid="child">♔</span>
      </Square>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  // Edge case: null/undefined children
  it('renders with null children', () => {
    const { container } = render(<Square {...baseProps}>{null}</Square>);
    const square = screen.getByRole('button');
    expect(square).toBeInTheDocument();
  });

  it('renders with undefined children', () => {
    const { container } = render(<Square {...baseProps}>{undefined}</Square>);
    const square = screen.getByRole('button');
    expect(square).toBeInTheDocument();
  });

  // Edge case: click events
  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Square {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onClick is undefined and clicked', () => {
    render(<Square {...baseProps} onClick={vi.fn()} />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });

  it('calls onClick on Enter key', () => {
    const onClick = vi.fn();
    render(<Square {...baseProps} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on Space key', () => {
    const onClick = vi.fn();
    render(<Square {...baseProps} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick on other key presses', () => {
    const onClick = vi.fn();
    render(<Square {...baseProps} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
    expect(onClick).not.toHaveBeenCalled();
  });

  // Accessibility
  it('has tabIndex 0 for keyboard navigation', () => {
    render(<Square {...baseProps} />);
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
  });

  // Edge case: multiple states overlay
  it('applies multiple state classes simultaneously', () => {
    render(
      <Square
        {...baseProps}
        isSelected
        isLegalMove
        isLastMove
        piece={null}
      />,
    );
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--selected');
    expect(square.className).toContain('square--legal-move');
    expect(square.className).toContain('square--last-move');
  });

  // Edge case: isLegalMove + capture + selected
  it('applies legal-capture with isSelected when both are true', () => {
    render(
      <Square
        {...baseProps}
        isSelected
        isLegalMove
        piece="p"
      />,
    );
    const square = screen.getByRole('button');
    expect(square.className).toContain('square--selected');
    expect(square.className).toContain('square--legal-capture');
  });
});
