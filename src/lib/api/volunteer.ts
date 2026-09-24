import { must } from '../errors';
import { supabase } from '../supabase';

export type VolunteerEvent = { id: string; name: string; starts_at: string | null; venue: string | null };

const SCANNER_ROLES = ['checkin_volunteer', 'event_lead'];

/**
 * Live events this login may check people in for: a checkin_volunteer or
 * event_lead grant, center-wide or scoped to the event, currently in force.
 */
export async function myVolunteerEvents(centerId: string): Promise<VolunteerEvent[]> {
  const grants = must(
    await supabase
      .from('role_grants')
      .select('role_key, scope_kind, scope_id, starts_at, ends_at')
      .eq('center_id', centerId)
      .in('role_key', SCANNER_ROLES),
    'check your volunteer roles',
  );
  const now = Date.now();
  const active = grants.filter((g) => new Date(g.starts_at).getTime() <= now && (!g.ends_at || new Date(g.ends_at).getTime() > now));
  if (active.length === 0) return [];
  const centerWide = active.some((g) => g.scope_kind === 'center' || g.scope_kind === 'platform');
  const scopedIds = active.filter((g) => g.scope_kind === 'event' && g.scope_id).map((g) => g.scope_id as string);
  let query = supabase.from('events').select('id, name, starts_at, venue').eq('center_id', centerId).eq('status', 'live').order('starts_at');
  if (!centerWide) {
    if (scopedIds.length === 0) return [];
    query = query.in('id', scopedIds);
  }
  return must(await query, 'load live events');
}

export type CheckInResult = {
  result: 'ok' | 'duplicate' | 'invalid' | 'revoked' | 'wrong_event' | string;
  householdName: string | null;
  attendees: { id: string; name: string; checked_in: boolean; senior: boolean; child_under_12: boolean; assistance: boolean; lunch: string | null }[];
};

export async function checkIn(eventId: string, token: string, station: string, deviceId: string | null): Promise<CheckInResult> {
  const rows = must(
    await supabase.rpc('check_in', { p_event: eventId, p_token: token, p_station: station, ...(deviceId ? { p_device: deviceId } : {}) }),
    'check this ticket in',
  );
  const row = rows[0];
  const attendees = Array.isArray(row?.attendees) ? (row.attendees as CheckInResult['attendees']) : [];
  return { result: row?.result ?? 'invalid', householdName: row?.household_name ?? null, attendees };
}
