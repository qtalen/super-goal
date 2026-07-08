import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PromotionDialog from '../components/PromotionDialog';

describe('PromotionDialog', () => {
  const defaultProps = {
    color: 'w' as const,
    onSelect: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders dialog with title', () => {
    render(<PromotionDialog {...defaultProps} />);
    expect(screen.getByText('Promotion')).toBeInTheDocument();
  });

  it('renders 4 promotion piece buttons', () => {
    render(<PromotionDialog {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('each piece button has accessible label', () => {
    render(<PromotionDialog {...defaultProps} />);
    expect(screen.getByLabelText('Promote to Queen')).toBeInTheDocument();
    expect(screen.getByLabelText('Promote to Rook')).toBeInTheDocument();
    expect(screen.getByLabelText('Promote to Bishop')).toBeInTheDocument();
    expect(screen.getByLabelText('Promote to Knight')).toBeInTheDocument();
  });

  it('shows correct hint for white', () => {
    render(<PromotionDialog {...defaultProps} color="w" />);
    expect(screen.getByText(/White pawn reached the last rank/)).toBeInTheDocument();
  });

  it('shows correct hint for black', () => {
    render(<PromotionDialog {...defaultProps} color="b" />);
    expect(screen.getByText(/Black pawn reached the last rank/)).toBeInTheDocument();
  });

  it('calls onSelect with "q" when queen button is clicked', () => {
    const onSelect = vi.fn();
    render(<PromotionDialog {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('Promote to Queen'));
    expect(onSelect).toHaveBeenCalledWith('q');
  });

  it('calls onSelect with "r" when rook button is clicked', () => {
    const onSelect = vi.fn();
    render(<PromotionDialog {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('Promote to Rook'));
    expect(onSelect).toHaveBeenCalledWith('r');
  });

  it('calls onSelect with "b" when bishop button is clicked', () => {
    const onSelect = vi.fn();
    render(<PromotionDialog {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('Promote to Bishop'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('calls onSelect with "n" when knight button is clicked', () => {
    const onSelect = vi.fn();
    render(<PromotionDialog {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('Promote to Knight'));
    expect(onSelect).toHaveBeenCalledWith('n');
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<PromotionDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn();
    render(<PromotionDialog {...defaultProps} onCancel={onCancel} />);
    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when dialog content is clicked', () => {
    const onCancel = vi.fn();
    render(<PromotionDialog {...defaultProps} onCancel={onCancel} />);
    const title = screen.getByText('Promotion');
    fireEvent.click(title);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('defaults to white color', () => {
    render(<PromotionDialog color="w" onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/White/)).toBeInTheDocument();
  });
});
