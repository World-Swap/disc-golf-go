// src/lib/storage.ts — single image-upload transport. Currently proxies to
// Cloudflare R2 via the Polsia proxy; the one place to change storage providers.

const R2_ENDPOINT = 'https://polsia.com/api/proxy/r2/upload';

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

interface R2Response {
  success?: boolean;
  file?: { url: string };
  error?: { message?: string };
}

/** Upload an image and return its public URL. Throws if storage is unconfigured. */
export async function uploadImage({ buffer, filename, contentType }: UploadInput): Promise<string> {
  const apiKey = process.env.POLSIA_API_KEY;
  if (!apiKey) throw new Error('File storage not configured');

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), filename);

  const res = await fetch(R2_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const result = (await res.json()) as R2Response;
  if (!result.success || !result.file?.url) {
    throw new Error(result.error?.message || 'Upload failed');
  }
  return result.file.url;
}
