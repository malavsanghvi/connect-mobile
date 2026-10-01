/**
 * Saathi family circle (My Jain Way › Saathi): who is in the circle and what each row may show. Everyone in the
 * household is listed — people still waiting to be added by the membership team, and people who keep their
 * progress to themselves — so nobody silently drops out of the family's circle. Pure; unit-tested.
 */

/** app.saathi_settings (connect-crm 0007). No row means the defaults: opted in and sharing with the family. */
export type SaathiSetting = { person_id: string; opted_in: boolean; share_with_family: boolean };

/** Whether this person shares their progress with the family (app.saathi_feed applies the same rule). */
export function sharesWithFamily(personId: string, settings: readonly SaathiSetting[]): boolean {
  const s = settings.find((r) => r.person_id === personId);
  return s ? s.opted_in && s.share_with_family : true;
}

/**
 * What the viewer may see of one member's progress. Their own, always. An adult reads the household's practice data
 * (RLS, app.can_act_for_person) but a member who turned sharing off is respected: "Not sharing progress". A child
 * reads only their own, so everyone else's progress is private to them.
 */
export type CircleVisibility = 'visible' | 'notSharing' | 'private';

export function circleVisibility(args: { isMe: boolean; viewerIsAdult: boolean; sharing: boolean }): CircleVisibility {
  if (args.isMe) return 'visible';
  if (!args.viewerIsAdult) return 'private';
  return args.sharing ? 'visible' : 'notSharing';
}

/** Someone an open "add family member" request names: shown "Waiting for approval", with no progress or actions. */
export type PendingCircleMember = { requestId: string; name: string | null; relationship: string | null };

/** The people named by the household's open add-member requests (household_change_requests, kind add_member). */
export function pendingCircleMembers(requests: readonly { id: string; kind: string; status: string; details: unknown }[]): PendingCircleMember[] {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return requests
    .filter((r) => r.kind === 'add_member' && r.status === 'open')
    .map((r) => {
      const d = r.details && typeof r.details === 'object' && !Array.isArray(r.details) ? (r.details as Record<string, unknown>) : {};
      return { requestId: r.id, name: text(d.first_name) ?? text(d.last_name), relationship: text(d.relationship) };
    });
}
