import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { reencodeProofPhoto } from '@/features/pay/proof-photo';

type Rendered = { width: number; height: number; saveAsync: jest.Mock<(opts: unknown) => Promise<{ uri: string; width: number; height: number }>> };

const mockManipulate = jest.fn<(source: unknown) => { resize: (size: unknown) => unknown; renderAsync: () => Promise<Rendered> }>();
const mockFileSize = jest.fn<(uri: string) => number | null>();

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (source: unknown) => mockManipulate(source) },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('expo-file-system', () => ({
  File: class {
    private readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get size() {
      return mockFileSize(this.uri);
    }
  },
}));

/** A picture the phone drew: its true size, and a save that gives back a new file. */
function drawn(width: number, height: number, savedAs = { uri: 'file:///cache/ImageManipulator/new.jpg', width, height }): Rendered {
  return { width, height, saveAsync: jest.fn(async () => savedAs) };
}

/** The chain the phone runs: manipulate(source) → resize(size) → renderAsync(). */
function chain(rendered: Rendered, onResize?: (size: unknown) => void) {
  const link = { resize: (size: unknown) => (onResize?.(size), link), renderAsync: async () => rendered };
  return link;
}

beforeEach(() => {
  mockManipulate.mockReset();
  mockFileSize.mockReset();
  mockFileSize.mockReturnValue(412_000);
});

describe('saving a proof photo again', () => {
  it('writes a new JPEG at about 80% and gives back its size, so nothing the camera added goes along', async () => {
    const small = drawn(1600, 1200);
    mockManipulate.mockReturnValueOnce(chain(small));
    const out = await reencodeProofPhoto('file:///photos/IMG_0001.heic');
    expect(mockManipulate).toHaveBeenCalledTimes(1);
    expect(mockManipulate).toHaveBeenCalledWith('file:///photos/IMG_0001.heic');
    expect(small.saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });
    expect(out).toEqual({ uri: 'file:///cache/ImageManipulator/new.jpg', width: 1600, height: 1200, bytes: 412_000 });
  });

  it('shrinks a wide photo to 2000 px across, using the size the picture really has', async () => {
    const first = drawn(4032, 3024);
    const second = drawn(2000, 1500, { uri: 'file:///cache/ImageManipulator/small.jpg', width: 2000, height: 1500 });
    const sizes: unknown[] = [];
    mockManipulate.mockReturnValueOnce(chain(first)).mockReturnValueOnce(chain(second, (size) => sizes.push(size)));
    const out = await reencodeProofPhoto('file:///photos/wide.jpg');
    expect(sizes).toEqual([{ width: 2000 }]);
    expect(mockManipulate).toHaveBeenLastCalledWith(first);
    expect(first.saveAsync).not.toHaveBeenCalled();
    expect(second.saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });
    expect(out.uri).toBe('file:///cache/ImageManipulator/small.jpg');
    expect(out.width).toBe(2000);
  });

  it('shrinks a tall photo to 2000 px high', async () => {
    const sizes: unknown[] = [];
    mockManipulate.mockReturnValueOnce(chain(drawn(3024, 4032))).mockReturnValueOnce(chain(drawn(1500, 2000), (size) => sizes.push(size)));
    await reencodeProofPhoto('file:///photos/tall.jpg');
    expect(sizes).toEqual([{ height: 2000 }]);
  });

  it('gives no size when the phone cannot read the new file (the upload measures it)', async () => {
    mockManipulate.mockReturnValueOnce(chain(drawn(800, 600)));
    mockFileSize.mockImplementation(() => {
      throw new Error('no such file');
    });
    expect((await reencodeProofPhoto('file:///photos/a.jpg')).bytes).toBeNull();
    mockManipulate.mockReturnValueOnce(chain(drawn(800, 600)));
    mockFileSize.mockReturnValue(null);
    expect((await reencodeProofPhoto('file:///photos/b.jpg')).bytes).toBeNull();
  });

  it('throws when the photo cannot be drawn, so it is left out and never sent as it was', async () => {
    mockManipulate.mockReturnValueOnce({
      resize: () => undefined,
      renderAsync: async () => {
        throw new Error('cannot decode');
      },
    });
    await expect(reencodeProofPhoto('file:///photos/broken.jpg')).rejects.toThrow('cannot decode');
  });
});
