import type { Translate } from '@/i18n';
import type { PledgeWithPeople } from '@/lib/api/giving';

/** The words for where a pledge came from ("RSVP commitment", "Sponsorship"); a source the dictionary does not name shows as it is. */
export function sourceLabel(t: Translate, source: string): string {
  const key = `source.${source}` as Parameters<Translate>[0];
  const v = t(key);
  return v === key ? source : v;
}

type Nameable = Pick<PledgeWithPeople, 'opportunityName' | 'optionLabel' | 'dedication' | 'campaignName' | 'source'>;

/** What a pledge is for: its opportunity and option, else its dedication, else its campaign, else where it came from. */
export function pledgeTitle(t: Translate, p: Nameable): string {
  return p.opportunityName ? [p.opportunityName, p.optionLabel].filter(Boolean).join(' · ') : p.dedication || p.campaignName || sourceLabel(t, p.source);
}

/** The line under the title: the campaign (when it is not the title itself), or the dedication of an opportunity, else the source. */
export function pledgeSubtitle(t: Translate, p: Nameable, title: string): string {
  return [p.campaignName && p.campaignName !== title ? p.campaignName : null, p.opportunityName && p.dedication ? p.dedication : null].filter(Boolean).join(' · ') || sourceLabel(t, p.source);
}
