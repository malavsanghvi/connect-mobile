import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import type { StringKey } from '@/i18n/en';
import { removeProofUpload, type PickedProofFile, type ProofAttempt } from '@/lib/api/proofs';
import { AppError, logError, report } from '@/lib/errors';
import { proofFileProblem, proofFileType, type FileProblem } from '@/lib/proofs';
import { newRequestId } from '@/lib/request-context';
import { useT } from '@/providers/settings';

/**
 * The photos a family adds to a proof, from the gallery (the camera and files need the next native build). Checks the type and
 * size of each before anything is sent and says what is wrong in plain words. `room` is how many more files the proof can take.
 */
export function useProofFiles(attempt: ProofAttempt, room: number): {
  files: PickedProofFile[];
  /** Why the last choice did not (fully) work, or null. */
  notice: string | null;
  pick: () => Promise<void>;
  remove: (file: PickedProofFile) => void;
  clear: () => void;
} {
  const t = useT();
  const [files, setFiles] = useState<PickedProofFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = async () => {
    setNotice(null);
    try {
      const left = room - files.length;
      if (left <= 0) {
        setNotice(t('proof.problem.files_too_many'));
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new AppError(t('proof.pickDenied'), `image picker permission ${perm.status}`);
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: left, quality: 0.85 });
      if (picked.canceled) return;
      const added: PickedProofFile[] = [];
      let refused: FileProblem | null = null;
      for (const asset of picked.assets.slice(0, left)) {
        const type = proofFileType({ fileName: asset.fileName, mimeType: asset.mimeType, uri: asset.uri });
        const problem: FileProblem | null = type ? proofFileProblem({ contentType: type.contentType, bytes: asset.fileSize ?? null }) : 'type';
        if (problem) {
          refused = refused ?? problem;
          continue;
        }
        added.push({ id: newRequestId(), uri: asset.uri, fileName: asset.fileName ?? null, mimeType: asset.mimeType ?? null, bytes: asset.fileSize ?? null });
      }
      if (added.length > 0) setFiles((prev) => [...prev, ...added].slice(0, room));
      if (refused) setNotice(t(`proof.err.${refused}` as StringKey));
    } catch (err) {
      if (err instanceof AppError) logError('choose a photo', err);
      setNotice(err instanceof AppError ? err.userMessage : `${t('proof.pickFailed')} ${report(err, 'choose a photo').userMessage}`);
    }
  };

  const remove = (file: PickedProofFile) => {
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    // A file that already went up in a failed try is taken out again (best effort; the office clean-up removes any left behind).
    const up = attempt.uploaded.get(file.id);
    if (up) {
      attempt.uploaded.delete(file.id);
      void removeProofUpload(up.path);
    }
  };

  return { files, notice, pick, remove, clear: () => setFiles([]) };
}
