import { ReactNode } from 'react';
import { Badge } from '../common/Badge';

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: string;
  label?: ReactNode;
}

const toneByStatus: Record<string, Tone> = {
  active: 'success',
  posted: 'success',
  paid: 'success',
  safe: 'success',
  cancelled: 'danger',
  expired: 'danger',
  failed: 'danger',
  out_of_stock: 'danger',
  due: 'warning',
  partial: 'warning',
  low_stock: 'warning',
  expiring_soon: 'warning',
  draft: 'info',
  pending: 'info',
  inactive: 'neutral',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const normalized = status.trim().toLowerCase().replace(/\s+/g, '_');
  const readable = normalized.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  return <Badge variant={toneByStatus[normalized] || 'neutral'}>{label || readable}</Badge>;
}
