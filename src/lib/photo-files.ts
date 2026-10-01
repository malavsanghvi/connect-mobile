/** File names and content types for saving or sharing photos from an album (shared by the album screen and the album card). */

/** "photo-3.jpg": the number is the photo's place in the album (1-based); the extension comes from the stored path, else jpg. */
export function photoFileName(storagePath: string, index: number): string {
  const ext = /\.([a-z0-9]{2,5})(\?|$)/i.exec(storagePath)?.[1]?.toLowerCase() ?? 'jpg';
  return `photo-${index + 1}.${ext}`;
}

export function photoMimeType(fileName: string): string {
  const ext = fileName.split('.').pop() ?? 'jpg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  return 'image/jpeg';
}
