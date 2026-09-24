import type { Translate } from '@/i18n';
import type { BoliStatus } from '@/lib/rules';

/** Plain-English status line. Always "pledge", never "bid". */
export function boliStatusText(t: Translate, status: BoliStatus): string {
  switch (status) {
    case 'mine_top':
      return t('bolis.statusMineTop');
    case 'pledged_more':
      return t('bolis.statusPledgedMore');
    case 'no_pledges':
      return t('bolis.statusNoPledges');
    case 'closed':
      return t('bolis.statusClosed');
    default:
      return t('bolis.statusOpen');
  }
}
