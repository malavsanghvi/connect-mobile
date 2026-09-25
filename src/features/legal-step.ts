// The member app's legal step (#20, owner decision 2026-09-25; connect-crm 0422): the
// community's published documents to accept (privacy, terms, notices) and consents to answer
// yes or no (photo, children), shown at the first sign-in and again for a new version. Pure.

export type LegalStepDoc = {
  documentId: string;
  kind: string;
  title: string;
  version: string;
  body: string;
  mode: 'accept' | 'consent';
  answered: boolean;
  /** The last answer to this version (consent documents show it again as the default). */
  granted: boolean | null;
  /** The version answered before, when a new one is being asked. */
  answeredVersion: string | null;
};

export type LegalAnswers = Record<string, boolean | undefined>;

/** What is still to ask. */
export function pendingSteps(docs: LegalStepDoc[]): LegalStepDoc[] {
  return docs.filter((d) => !d.answered);
}

/** Why "Continue" cannot go yet (a StringKey + the document title), or null when it can. */
export function continueBlocker(docs: LegalStepDoc[], answers: LegalAnswers): { key: 'legal.mustAccept' | 'legal.mustAnswer'; title: string } | null {
  for (const d of docs) {
    const a = answers[d.documentId];
    if (d.mode === 'accept' && a !== true) return { key: 'legal.mustAccept', title: d.title };
    if (d.mode === 'consent' && a === undefined) return { key: 'legal.mustAnswer', title: d.title };
  }
  return null;
}

/** The payload for app.record_member_legal_answers. */
export function answersPayload(docs: LegalStepDoc[], answers: LegalAnswers): { document_id: string; granted: boolean }[] {
  return docs.map((d) => ({ document_id: d.documentId, granted: answers[d.documentId] === true }));
}

type Row = {
  document_id: string;
  kind: string;
  title: string;
  version: string;
  body_md: string;
  mode: string;
  answered: boolean;
  granted: boolean | null;
  answered_version: string | null;
};

/** Rows of app.member_legal_steps → documents (unknown modes are not asked). */
export function fromRows(rows: Row[]): LegalStepDoc[] {
  return rows
    .filter((r) => r.mode === 'accept' || r.mode === 'consent')
    .map((r) => ({
      documentId: r.document_id,
      kind: r.kind,
      title: r.title,
      version: r.version,
      body: r.body_md,
      mode: r.mode as 'accept' | 'consent',
      answered: r.answered,
      granted: r.granted,
      answeredVersion: r.answered_version && r.answered_version !== r.version ? r.answered_version : null,
    }));
}
