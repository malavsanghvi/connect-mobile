import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { fitLongestSide, PHOTO_MAX_SIDE, PHOTO_QUALITY } from '@/lib/proofs';

/** A photo as it will be uploaded: a new JPEG in the app's cache, and its size when the phone could say. */
export type ReencodedPhoto = { uri: string; width: number; height: number; bytes: number | null };

/**
 * Saves a photo again, as a JPEG no longer than 2000 px on its longest side at about 80% quality. The phone draws the
 * picture and writes a new file, so nothing the camera added (where the photo was taken, the phone's model, the time) goes
 * along with it, and a HEIC photo arrives as an ordinary JPEG. A photo that cannot be read throws: the caller says so in
 * words and leaves the photo out, because sending the original would send its location too.
 */
export async function reencodeProofPhoto(uri: string): Promise<ReencodedPhoto> {
  // One pass with no changes tells the true size (as the picture is turned upright), so the longest side is judged on what is seen.
  const drawn = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = fitLongestSide(drawn.width, drawn.height, PHOTO_MAX_SIDE);
  const image = resize ? await ImageManipulator.manipulate(drawn).resize(resize).renderAsync() : drawn;
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height, bytes: fileSize(saved.uri) };
}

/** The size of a file on the phone, or null when it cannot be read (the upload measures the file itself and decides). */
function fileSize(uri: string): number | null {
  try {
    const size = new File(uri).size;
    return typeof size === 'number' && size > 0 ? size : null;
  } catch {
    return null;
  }
}
