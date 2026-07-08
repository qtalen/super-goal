import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PromotionDialog from '../components/PromotionDialog';

describe('PromotionDialog', () => {
  const defaultProps = {
    color: 'w' as const,
    onSelect: vi.fn(),
    onCancel: vi.fn(),
  };

  // 正常情况：显示标题
  it('renders dialog with title', () => {
    render(<PromotionDialog {...defaultProps} />);
    expect(screen.getByText('升变 — 选择棋子')).toBeInTheDocument();
  });

  // 正常情况：显示 4 个棋子按钮
  it('renders 4 promotion piece buttons', () => {
    render(<PromotionDialog {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    // 4 个棋子按钮 + 1 个取消按钮 = 5
    expect(buttons).toHaveLength(5);
  });

  // 正常情况：每个棋子按钮都有可访问标签
  it('each piece button has accessible label', () => {
    render(<PromotionDialog {...defaultProps} />);
    expect(screen.getByLabelText('升变为后')).toBeInTheDocument();
    expect(screen.getByLabelText('升变为车')).toBeInTheDocument();
    expect(screen.getByLabelText('升变为象')).toBeInTheDocument();
    expect(screen.getByLabelText('升变为马')).toBeInTheDocument();
  });

  // 正常情况：显示白方提示
  it('shows correct hint for white', () => {
    render(<PromotionDialog {...defaultProps} color="w" />);
    expect(screen.getByText(/白方兵到达底线/)).toBeInTheDocument();
  });

  // 正常情况：显示黑方提示
  it('shows correct hint for black', () => {
    render(<PromotionDialog {...defaultProps} color="b" />);
    expect(screen.getByText(/黑方兵到达底线/)).toBeInTheDocument();
  });

  // 点击棋子触发 onSelect
  it('calls onSelect with "q" when queen button is clicked', () => {
    const onSelect = vi.fn();
    render(<PromotionDialog {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('升变为后'));
    expect(onSelect).toHaveBeenCalledWith('q');
  });

  it('calls onSelect with "r" when rook button is clicked', () => {
    const onSelect = vi.fn();
    render(<PromotionDialog {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('升变为车'));
    expect(onSelect).toHaveBeenCalledWith('r');
  });

  it('calls onSelect with "b" when bishop button is clicked', () => {
    const onSelect = vi.fn();
    render(<PromotionDialog {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('升变为象'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('calls onSelect with "n" when knight button is clicked', () => {
    const onSelect = vi.fn();
    render(<PromotionDialog {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('升变为马'));
    expect(onSelect).toHaveBeenCalledWith('n');
  });

  // 点击取消按钮
  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<PromotionDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('取消走子'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // 点击遮罩层触发取消
  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn();
    render(<PromotionDialog {...defaultProps} onCancel={onCancel} />);
    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // 点击对话框内部不触发取消（stopPropagation）
  it('does not call onCancel when dialog content is clicked', () => {
    const onCancel = vi.fn();
    render(<PromotionDialog {...defaultProps} onCancel={onCancel} />);
    const title = screen.getByText('升变 — 选择棋子');
    fireEvent.click(title);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // 边缘情况：默认颜色为白方
  it('defaults to white color', () => {
    render(<PromotionDialog color="w" onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/白方/)).toBeInTheDocument();
  });
});
