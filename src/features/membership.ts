import type { StringKey } from '@/i18n';

// Pure helpers for the membership application screens (no I/O).

const RANK: Record<string, number> = { community: 1, yearly: 2, life: 3 };

export function tierRank(tier: string | null | undefined): number {
  return tier ? (RANK[tier] ?? 0) : 0;
}

/** Types a family can apply for: active ones above the tier it holds, cheapest first. */
export function applyableTypes<T extends { tier: string; active: boolean; fee_cents: number }>(types: T[], heldTier: string | null): T[] {
  const held = tierRank(heldTier);
  return types.filter((t) => t.active && tierRank(t.tier) > held).sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.fee_cents - b.fee_cents);
}

/** Plain-English line for where an application stands (takes {name} = the reference). */
export function applicationStatusKey(status: string): StringKey {
  switch (status) {
    case 'awaiting_reference':
      return 'apply.st.awaiting_reference';
    case 'reference_declined':
      return 'apply.st.reference_declined';
    case 'awaiting_center':
      return 'apply.st.awaiting_center';
    case 'awaiting_ec':
      return 'apply.st.awaiting_ec';
    case 'approved':
      return 'apply.st.approved';
    case 'rejected':
      return 'apply.st.rejected';
    case 'expired':
      return 'apply.st.expired';
    case 'withdrawn':
      return 'apply.st.withdrawn';
    default:
      return 'apply.st.draft';
  }
}
