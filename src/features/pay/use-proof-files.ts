import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Linking } from 'react-native';

import type { Translate } from '@/i18n';
import type { StringKey } from '@/i18n/en';
import { removeProofUpload, type PickedProofFile, type ProofAttempt } from '@/lib/api/proofs';
import { AppError, logError, report } from '@/lib/errors';
import { isPdfType, proofFileProblem, proofFileType, type FileProblem } from '@/lib/proofs';
import { newRequestId } from '@/lib/request-context';
import { useT } from '@/providers/settings';

import { reencodeProofPhoto } from './proof-photo';

/** Where a file comes from: the camera, the photo library, or the phone's files (PDFs and pictures). */
export type ProofFileSource = 'camera' | 'library' | 'file';

/** Why the last choice did not (fully) work. `settings`: the fix is in the phone's Settings app, so the screen offers a way there. */
export type ProofFileNotice = { message: string; settings: boolean };

/** What a picker handed back, before it is checked: a picture or a document. */
type Chosen = { uri: string; fileName: string | null; mimeType: string | null; bytes: number | null };

/** The only documents a proof takes: PDFs and pictures. */
const DOCUMENT_TYPES = ['application/pdf', 'image/*'];

type PickerAsset = { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number | null };

const fromAsset = (a: PickerAsset): Chosen => ({ uri: a.uri, fileName: a.fileName ?? null, mimeType: a.mimeType ?? null, bytes: a.fileSize ?? null });

async function chooseFromCamera(t: Translate): Promise<Chosen[] | 'denied' | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    logError('take a photo', new AppError(t('proof.cameraDenied'), `camera permission ${perm.status}`));
    return 'denied';
  }
  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  return shot.canceled ? null : shot.assets.map(fromAsset);
}

async function chooseFromLibrary(t: Translate, left: number): Promise<Chosen[] | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new AppError(t('proof.pickDenied'), `image picker permission ${perm.status}`);
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: left, quality: 1 });
  return picked.canceled ? null : picked.assets.map(fromAsset);
}

async function chooseFromFiles(): Promise<Chosen[] | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, multiple: true, copyToCacheDirectory: true });
  return picked.canceled ? null : picked.assets.map((a) => fromAsset({ uri: a.uri, fileName: a.name, mimeType: a.mimeType, fileSize: a.size }));
}

/**
 * The photos and files a family adds to a proof: Take a photo, Choose a photo, Attach a file (up to `room` together; a PDF
 * or a picture, 10 MB each). Every picture, from any of the three, is saved again as a smaller JPEG on the phone first, which
 * leaves out where it was taken; a PDF goes as it is. Checks the type and size of each before anything is sent and says
 * what is wrong in plain words. A picture that cannot be prepared is left out and said so, never sent as it was.
 */
export function useProofFiles(attempt: ProofAttempt, room: number): {
  files: PickedProofFile[];
  /** Why the last choice did not (fully) work, or null. */
  notice: ProofFileNotice | null;
  /** True while pictures are being prepared. */
  working: boolean;
  pick: (source: ProofFileSource) => Promise<void>;
  /** Try the last choice again. */
  retry: () => Promise<void>;
  /** Open the phone's Settings app (for a refused camera), and say so if it cannot be opened. */
  openSettings: () => Promise<void>;
  remove: (file: PickedProofFile) => void;
  clear: () => void;
} {
  const t = useT();
  const [files, setFiles] = useState<PickedProofFile[]>([]);
  const [notice, setNotice] = useState<ProofFileNotice | null>(null);
  const [working, setWorking] = useState(false);
  const last = useRef<ProofFileSource>('library');
  const busy = useRef(false);

  const say = (message: string, settings = false) => setNotice({ message, settings });

  const pick = async (source: ProofFileSource) => {
    if (busy.current) return;
    last.current = source;
    setNotice(null);
    const left = room - files.length;
    if (left <= 0) {
      say(t('proof.problem.files_too_many'));
      return;
    }
    busy.current = true;
    try {
      const chosen = source === 'camera' ? await chooseFromCamera(t) : source === 'library' ? await chooseFromLibrary(t, left) : await chooseFromFiles();
      if (chosen === 'denied') {
        say(t('proof.cameraDenied'), true);
        return;
      }
      if (!chosen) return;
      setWorking(true);
      const added: PickedProofFile[] = [];
      let refused: FileProblem | null = null;
      let unprepared = false;
      for (const item of chosen.slice(0, left)) {
        const type = proofFileType({ fileName: item.fileName, mimeType: item.mimeType, uri: item.uri });
        if (!type) {
          refused = refused ?? 'type';
          continue;
        }
        if (isPdfType(type.contentType)) {
          // A PDF is sent as it is: only its size can be judged here.
          const problem = proofFileProblem({ contentType: type.contentType, bytes: item.bytes });
          if (problem) {
            refused = refused ?? problem;
            continue;
          }
          added.push({ id: newRequestId(), uri: item.uri, fileName: item.fileName, mimeType: type.contentType, bytes: item.bytes });
          continue;
        }
        // A picture is saved again first (smaller, upright, without its location); its size is judged after, so a large photo is fine.
        try {
          const photo = await reencodeProofPhoto(item.uri);
          const problem = proofFileProblem({ contentType: 'image/jpeg', bytes: photo.bytes });
          if (problem) {
            refused = refused ?? problem;
            continue;
          }
          added.push({ id: newRequestId(), uri: photo.uri, fileName: null, mimeType: 'image/jpeg', bytes: photo.bytes });
        } catch (err) {
          logError('prepare a proof photo', err);
          unprepared = true;
        }
      }
      if (added.length > 0) setFiles((prev) => [...prev, ...added].slice(0, room));
      if (refused) say(t(`proof.err.${refused}` as StringKey));
      else if (unprepared) say(t('proof.photoPrepFailed'));
      else if (chosen.length > left) say(t('proof.problem.files_too_many'));
    } catch (err) {
      const action = source === 'camera' ? 'take a photo' : source === 'library' ? 'choose a photo' : 'attach a file';
      if (err instanceof AppError) logError(action, err);
      const failed = t(source === 'camera' ? 'proof.cameraFailed' : source === 'library' ? 'proof.pickFailed' : 'proof.filePickFailed');
      say(err instanceof AppError ? err.userMessage : `${failed} ${report(err, action).userMessage}`);
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (err) {
      logError('open the phone settings', err);
      say(t('proof.settingsFailed'));
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

  return { files, notice, working, pick, retry: () => pick(last.current), openSettings, remove, clear: () => setFiles([]) };
}
