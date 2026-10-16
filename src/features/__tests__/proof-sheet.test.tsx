import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { ProofSheet, type ProofSheetPledge } from '@/features/pay/proof-sheet';
import type { ProofSetup } from '@/features/pay/proof-setup';
import { AppError } from '@/lib/errors';
import { DEFAULT_POLICY, parseSubmitted, type SubmittedProof } from '@/lib/proofs';
import { SettingsProvider } from '@/providers/settings';

const mockSubmit = jest.fn<(args: Record<string, unknown>) => Promise<SubmittedProof>>();
const mockPick = jest.fn<(opts: unknown) => Promise<{ canceled: boolean; assets: { uri: string; fileName: string | null; mimeType: string | null; fileSize: number | null }[] }>>();
const mockPush = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => mockInvalidate() }) }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async () => undefined }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  launchImageLibraryAsync: (opts: unknown) => mockPick(opts),
}));
jest.mock('@/lib/api/proofs', () => ({
  newProofAttempt: () => ({ proofId: '11111111-1111-4111-8111-111111111111', key: 'proof-key-1234', uploaded: new Map() }),
  submitPaymentProof: (args: Record<string, unknown>) => mockSubmit(args),
  removeProofUpload: async () => undefined,
  proofFileUrls: async () => new Map<string, string>(),
}));

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const setup: ProofSetup = { methods: ['check', 'cash', 'ach'], policy: DEFAULT_POLICY };

const pledge = (id: string, number: string, title: string, amount: number, pledgedAt: string): ProofSheetPledge => ({
  id,
  number,
  title,
  amount_cents: amount,
  paid_cents: 0,
  soft_credit_cents: 0,
  status: 'open',
  pledged_at: pledgedAt,
  created_at: pledgedAt,
  closed_at: null,
});
const FAMILY = [
  pledge('building', 'P-0601', 'Building fund', 30000, '2026-09-20T10:00:00Z'),
  pledge('supper', 'P-0587', 'Harvest supper', 16000, '2026-09-02T10:00:00Z'),
  pledge('food', 'P-0633', 'Fall food drive sponsorship', 10000, '2026-10-03T10:00:00Z'),
];

const sentAnswer = (over: Record<string, unknown> = {}): SubmittedProof => {
  const parsed = parseSubmitted({
    proof: {
      id: 'pr1',
      status: 'submitted',
      method: 'check',
      amount_cents: 25000,
      paid_on: '2026-10-12',
      created_at: '2026-10-12T14:14:00Z',
      covered: [
        { pledge_id: 'supper', pledge_number: 'P-0587', title: 'Harvest supper', amount_cents: 16000, pledge_amount_cents: 16000, state: 'active' },
        { pledge_id: 'building', pledge_number: 'P-0601', title: 'Building fund', amount_cents: 9000, pledge_amount_cents: 30000, state: 'active' },
      ],
      ...over,
    },
    replayed: false,
    lookalikes: [],
  });
  if (!parsed) throw new Error('fixture');
  return parsed;
};

async function render(el: ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>{el}</SettingsProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

const flat = (node: ReactTestInstance): string =>
  [node.props.children]
    .flat(Infinity)
    .map((c: unknown) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
const texts = (tree: ReactTestRenderer): string[] => tree.root.findAllByType(Text).map(flat).filter(Boolean);
const hasText = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t === s);
const mentions = (tree: ReactTestRenderer, re: RegExp): boolean => texts(tree).some((t) => re.test(t));
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll((n) => isPressable(n) && (n.props.accessibilityLabel === label || (n.props.accessibilityLabel === undefined && n.findAllByType(Text).some((x) => flat(x) === label))));
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}"`);
  await act(async () => {
    hit.props.onPress();
  });
};
const hasButton = (tree: ReactTestRenderer, label: string): boolean => pressables(tree, label).length > 0;
const buttonDisabled = (tree: ReactTestRenderer, label: string): boolean => !!pressables(tree, label)[0]?.props.disabled;
const input = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const hit = tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === label);
  if (!hit) throw new Error(`no field called "${label}"`);
  return hit;
};
const type = async (tree: ReactTestRenderer, label: string, value: string): Promise<void> => {
  await act(async () => {
    input(tree, label).props.onChangeText(value);
  });
};
const chosen = (tree: ReactTestRenderer, label: string): boolean => pressables(tree, label)[0]?.props.accessibilityState?.checked === true;

const photo = (name = 'check-front.jpg', fileSize: number | null = 1_400_000) => ({ canceled: false, assets: [{ uri: `file:///photos/${name}`, fileName: name, mimeType: 'image/jpeg', fileSize }] });

async function open(over: Partial<React.ComponentProps<typeof ProofSheet>> = {}): Promise<ReactTestRenderer> {
  return render(
    <ProofSheet visible onClose={jest.fn()} setup={setup} centerId="c1" householdId="h1" today="2026-10-15" pledges={FAMILY} entry="open_pledges" {...over} />,
  );
}

beforeEach(() => {
  mockSubmit.mockReset();
  mockPick.mockReset();
  mockPush.mockReset();
  mockInvalidate.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('I paid another way: step 1', () => {
  it('offers only the ways this community takes, with the total still to pay as the amount', async () => {
    const tree = await open();
    expect(hasText(tree, 'I paid another way')).toBe(true);
    expect(hasText(tree, 'Step 1 of 3')).toBe(true);
    expect(['Check', 'Cash', 'Bank transfer'].every((m) => hasButton(tree, m))).toBe(true);
    expect(hasButton(tree, 'Stock')).toBe(false);
    expect(hasButton(tree, 'Other')).toBe(false);
    expect(chosen(tree, 'Check')).toBe(true);
    expect(input(tree, 'Amount you paid').props.value).toBe('560');
    expect(mentions(tree, /^You have \$560 left to pay\. It covers your oldest pledges first\.$/)).toBe(true);
  });

  it('asks for the reference in the words of the way of paying', async () => {
    const tree = await open();
    expect(() => input(tree, 'Check number')).not.toThrow();
    await press(tree, 'Cash');
    expect(() => input(tree, 'Receipt or envelope number (optional)')).not.toThrow();
    await press(tree, 'Bank transfer');
    expect(() => input(tree, 'Bank reference (optional)')).not.toThrow();
  });

  it('stays on this step and says what is wrong in the field', async () => {
    const tree = await open();
    await type(tree, 'Amount you paid', '');
    await press(tree, 'Next: add your proof');
    expect(hasText(tree, 'Step 1 of 3')).toBe(true);
    expect(hasText(tree, 'Enter the amount you paid.')).toBe(true);
    await type(tree, 'Amount you paid', '12.345');
    await press(tree, 'Next: add your proof');
    expect(hasText(tree, 'Enter an amount like 250 or 250.00.')).toBe(true);
  });

  it('tells a family with nothing left to pay that there is nothing for a proof to cover', async () => {
    const tree = await open({ pledges: [{ ...FAMILY[0], status: 'soft_credit', soft_credit_cents: 30000 }] });
    await press(tree, 'Next: add your proof');
    expect(mentions(tree, /^You have no open pledge that this can cover/)).toBe(true);
    expect(hasText(tree, 'Step 1 of 3')).toBe(true);
  });

  it('only counts the pledges the family ticked, and says so', async () => {
    const tree = await open({ initialPledgeIds: ['supper', 'food'] });
    expect(input(tree, 'Amount you paid').props.value).toBe('260');
    expect(mentions(tree, /^The 2 pledges you chose have \$260 left to pay\./)).toBe(true);
  });
});

describe('I paid another way: step 2, the proof', () => {
  it('needs a photo for a check, and does not move on without one', async () => {
    const tree = await open();
    await type(tree, 'Amount you paid', '250');
    await press(tree, 'Next: add your proof');
    expect(hasText(tree, 'Step 2 of 3')).toBe(true);
    expect(mentions(tree, /^Add at least one photo or file\. A proof is needed for Check\.$/)).toBe(true);
    await press(tree, 'Next: check and send');
    expect(hasText(tree, 'Step 2 of 3')).toBe(true);
    expect(hasText(tree, 'Add a photo or file of your receipt. A proof is needed for this way of paying.')).toBe(true);
  });

  it('lets cash go on with no photo, because the community does not require one', async () => {
    const tree = await open();
    await press(tree, 'Cash');
    await type(tree, 'Amount you paid', '60');
    await press(tree, 'Next: add your proof');
    expect(mentions(tree, /^A proof is optional for Cash/)).toBe(true);
    await press(tree, 'Next: check and send');
    expect(hasText(tree, 'Step 3 of 3')).toBe(true);
  });

  it('adds photos from the gallery, shows them, takes one off, and stops at five', async () => {
    const tree = await open();
    await press(tree, 'Next: add your proof');
    mockPick.mockResolvedValueOnce(photo('front.jpg'));
    await press(tree, 'Choose a photo');
    expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5 }));
    expect(hasText(tree, '1 of 5 files')).toBe(true);
    expect(hasText(tree, 'Photo 1')).toBe(true);
    expect(hasText(tree, '1.3 MB')).toBe(true);
    mockPick.mockResolvedValueOnce({ canceled: false, assets: ['b', 'c', 'd', 'e', 'f'].map((n) => ({ uri: `file:///photos/${n}.jpg`, fileName: `${n}.jpg`, mimeType: 'image/jpeg', fileSize: 1000 })) });
    await press(tree, 'Add another photo');
    expect(mockPick).toHaveBeenLastCalledWith(expect.objectContaining({ selectionLimit: 4 }));
    expect(hasText(tree, '5 of 5 files')).toBe(true);
    expect(buttonDisabled(tree, 'Add another photo')).toBe(true);
    await press(tree, 'Remove Photo 5');
    expect(hasText(tree, '4 of 5 files')).toBe(true);
  });

  it('says why a photo was left out, in plain words, and keeps the good ones', async () => {
    const tree = await open();
    await press(tree, 'Next: add your proof');
    mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///a.gif', fileName: 'a.gif', mimeType: 'image/gif', fileSize: 10 }, { uri: 'file:///b.jpg', fileName: 'b.jpg', mimeType: 'image/jpeg', fileSize: 20 * 1024 * 1024 }, { uri: 'file:///c.jpg', fileName: 'c.jpg', mimeType: 'image/jpeg', fileSize: 500 }] });
    await press(tree, 'Choose a photo');
    expect(hasText(tree, '1 of 5 files')).toBe(true);
    expect(hasText(tree, 'Choose a JPEG, PNG, WebP or HEIC photo, or a PDF.')).toBe(true);
  });

  it('says so when the photos cannot be opened, with a way to try again', async () => {
    const tree = await open();
    await press(tree, 'Next: add your proof');
    mockPick.mockRejectedValueOnce(new Error('picker crashed'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await press(tree, 'Choose a photo');
    expect(mentions(tree, /^We couldn't open your photos\./)).toBe(true);
    expect(hasButton(tree, 'Try again')).toBe(true);
  });
});

describe('I paid another way: step 3 and sending', () => {
  async function toReview(extra: Partial<React.ComponentProps<typeof ProofSheet>> = {}): Promise<ReactTestRenderer> {
    const tree = await open(extra);
    await type(tree, 'Amount you paid', '250');
    await type(tree, 'Check number', '1048');
    await press(tree, 'Next: add your proof');
    mockPick.mockResolvedValueOnce(photo());
    await press(tree, 'Choose a photo');
    await press(tree, 'Next: check and send');
    return tree;
  }

  it('shows where it will go, oldest pledge first, and what each would become', async () => {
    const tree = await toReview();
    expect(hasText(tree, 'Step 3 of 3')).toBe(true);
    expect(hasText(tree, '$250 · Check 1048')).toBe(true);
    expect(mentions(tree, /^Paid Oct 15, 2026 · 1 of 5 files$/)).toBe(true);
    const all = texts(tree);
    expect(all.indexOf('Harvest supper')).toBeGreaterThan(-1);
    expect(all.indexOf('Harvest supper')).toBeLessThan(all.indexOf('Building fund'));
    expect(all).not.toContain('Fall food drive sponsorship');
    expect(all).toEqual(expect.arrayContaining(['$160 of $160', 'Soft credit', '$90 of $300', '$210 still to pay']));
    expect(mentions(tree, /^Nothing is paid until the treasury team checks your proof\./)).toBe(true);
  });

  it('says what happens to an amount larger than the open pledges', async () => {
    const tree = await open({ pledges: [FAMILY[1]] });
    await type(tree, 'Amount you paid', '200');
    await press(tree, 'Next: add your proof');
    mockPick.mockResolvedValueOnce(photo());
    await press(tree, 'Choose a photo');
    await press(tree, 'Next: check and send');
    expect(mentions(tree, /^\$200 is more than your open pledges need\. Only \$160 can be credited\./)).toBe(true);
  });

  it('is not "Sent" until the database has answered, then says so and lists what happens next', async () => {
    const tree = await toReview();
    let finish!: (s: SubmittedProof) => void;
    mockSubmit.mockImplementationOnce(() => new Promise<SubmittedProof>((resolve) => (finish = resolve)));
    await press(tree, 'Send to the treasury team');
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(hasText(tree, 'Sent to the treasury team')).toBe(false);
    expect(hasText(tree, 'Sending…')).toBe(true);
    await act(async () => {
      finish(sentAnswer());
    });
    expect(hasText(tree, 'Sent to the treasury team')).toBe(true);
    expect(hasText(tree, 'Your $250 proof is in. 2 pledges now show Soft credit.')).toBe(true);
    expect(mentions(tree, /^The treasury team looks at your photo/)).toBe(true);
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('sends exactly what was entered: the method, whole cents, the date, the reference, all pledges as none, and the photo', async () => {
    const tree = await toReview();
    mockSubmit.mockResolvedValueOnce(sentAnswer());
    await press(tree, 'Send to the treasury team');
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ centerId: 'c1', householdId: 'h1', method: 'check', amountCents: 25000, paidOn: '2026-10-15', reference: '1048', pledgeIds: null, entry: 'open_pledges', entryRef: null }),
    );
    const sent = mockSubmit.mock.calls[0][0] as { files: { uri: string }[] };
    expect(sent.files.map((f) => f.uri)).toEqual(['file:///photos/check-front.jpg']);
  });

  it('a second tap while it is being sent does not send a second proof', async () => {
    const tree = await toReview();
    mockSubmit.mockImplementation(() => new Promise<SubmittedProof>(() => undefined));
    const button = pressables(tree, 'Send to the treasury team')[0];
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows why it was not sent, never "Sent", and the retry uses the same try', async () => {
    const tree = await toReview();
    mockSubmit.mockRejectedValueOnce(new AppError('Could not send your proof — You already have 5 proofs waiting. Wait for the treasury team to check one, or take one back.', 'refused', '22023'));
    await press(tree, 'Send to the treasury team');
    expect(mentions(tree, /^Could not send your proof — You already have 5 proofs waiting/)).toBe(true);
    expect(hasText(tree, 'Sent to the treasury team')).toBe(false);
    expect(mockInvalidate).not.toHaveBeenCalled();
    mockSubmit.mockResolvedValueOnce(sentAnswer());
    await press(tree, 'Try again');
    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect((mockSubmit.mock.calls[1][0] as { attempt: unknown }).attempt).toBe((mockSubmit.mock.calls[0][0] as { attempt: unknown }).attempt);
    expect(hasText(tree, 'Sent to the treasury team')).toBe(true);
  });

  it('shows a connection failure in plain words and keeps the form', async () => {
    const tree = await toReview();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSubmit.mockRejectedValueOnce(new TypeError('Network request failed'));
    await press(tree, 'Send to the treasury team');
    expect(mentions(tree, /^We couldn't send your proof\. Check your internet connection and try again\.$/)).toBe(true);
    expect(hasText(tree, 'Step 3 of 3')).toBe(true);
  });

  it('warns about a payment that looks like one already on file', async () => {
    const tree = await toReview();
    const answer = parseSubmitted({ proof: { id: 'pr1', status: 'submitted', method: 'check', amount_cents: 25000, paid_on: '2026-10-12', created_at: '2026-10-12T14:14:00Z', covered: [] }, replayed: false, lookalikes: [{ kind: 'payment', label: 'Receipt R-1, check, Oct 12', certain: true }] });
    if (!answer) throw new Error('fixture');
    mockSubmit.mockResolvedValueOnce(answer);
    await press(tree, 'Send to the treasury team');
    expect(mentions(tree, /^This looks like something already on file: Receipt R-1, check, Oct 12\./)).toBe(true);
  });

  it('opens My payment proofs from the sent screen', async () => {
    const onClose = jest.fn();
    const tree = await toReview({ onClose });
    mockSubmit.mockResolvedValueOnce(sentAnswer());
    await press(tree, 'Send to the treasury team');
    await press(tree, 'See my payment proofs');
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/payment-proofs');
  });
});

describe('I paid another way from an RSVP', () => {
  const rsvpPledge = pledge('rsvp-pledge', 'P-0587', 'Harvest supper', 16000, '2026-09-02T10:00:00Z');
  async function openRsvp(): Promise<ReactTestRenderer> {
    return open({ pledges: [rsvpPledge], entry: 'rsvp', lockedPledgeId: 'rsvp-pledge', entryRef: 'rsvp-1', forLabel: 'P-0587 · Harvest supper' });
  }

  it('locks the amount to the pledge and does not let it be typed', async () => {
    const tree = await openRsvp();
    expect(hasText(tree, 'P-0587 · Harvest supper')).toBe(true);
    expect(hasText(tree, '$160, set by your RSVP')).toBe(true);
    expect(() => input(tree, 'Amount you paid')).toThrow();
  });

  it('sends the proof for that pledge only, with the RSVP as its entry', async () => {
    const tree = await openRsvp();
    await press(tree, 'Next: add your proof');
    mockPick.mockResolvedValueOnce(photo());
    await press(tree, 'Choose a photo');
    await press(tree, 'Next: check and send');
    expect(mentions(tree, /^Your places are held\. This pledge shows Soft credit until the treasury team checks your proof\.$/)).toBe(true);
    mockSubmit.mockResolvedValueOnce(sentAnswer({ entry: 'rsvp', amount_cents: 16000 }));
    await press(tree, 'Send proof and keep my places');
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ entry: 'rsvp', entryRef: 'rsvp-1', pledgeIds: ['rsvp-pledge'], amountCents: 16000 }));
    expect(hasText(tree, 'Sent to the treasury team')).toBe(true);
    expect(hasButton(tree, 'Done')).toBe(true);
  });
});

describe('closing the sheet', () => {
  it('starts again from the first step with a new form when it is opened again', async () => {
    const onClose = jest.fn();
    const tree = await open({ onClose });
    await type(tree, 'Amount you paid', '99');
    await act(async () => {
      tree.update(
        <SafeAreaProvider initialMetrics={insets}>
          <SettingsProvider>
            <ProofSheet visible={false} onClose={onClose} setup={setup} centerId="c1" householdId="h1" today="2026-10-15" pledges={FAMILY} entry="open_pledges" />
          </SettingsProvider>
        </SafeAreaProvider>,
      );
    });
    expect(texts(tree)).toEqual([]);
    await act(async () => {
      tree.update(
        <SafeAreaProvider initialMetrics={insets}>
          <SettingsProvider>
            <ProofSheet visible onClose={onClose} setup={setup} centerId="c1" householdId="h1" today="2026-10-15" pledges={FAMILY} entry="open_pledges" />
          </SettingsProvider>
        </SafeAreaProvider>,
      );
    });
    expect(input(tree, 'Amount you paid').props.value).toBe('560');
    await press(tree, 'Close');
    expect(onClose).toHaveBeenCalled();
  });
});
