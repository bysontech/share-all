/** Cloudflare Images API helper */

export interface CfImagesResult {
  imageId: string;
  /** Full delivery URL from the variants array (e.g. https://imagedelivery.net/{hash}/{id}/public) */
  deliveryUrl: string;
}

/**
 * Uploads an image buffer to Cloudflare Images and returns the image ID and delivery URL.
 * Returns null on any failure so callers can degrade gracefully.
 */
export async function uploadToCloudflareImages(
  accountId: string,
  apiToken: string,
  imageBuffer: ArrayBuffer,
  mimeType: string,
  filename: string
): Promise<CfImagesResult | null> {
  try {
    const blob = new Blob([imageBuffer], { type: mimeType });
    const fd = new FormData();
    fd.append('file', blob, filename);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}` },
        body: fd,
      }
    );

    const json = (await res.json()) as {
      success: boolean;
      result?: { id: string; variants?: string[] };
      errors?: { message: string; code?: number }[];
    };

    if (!json.success || !json.result) {
      console.error('[cf-images] API returned failure', {
        status: res.status,
        errors: json.errors,
      });
      return null;
    }

    const imageId = json.result.id;
    const deliveryUrl = json.result.variants?.[0] ?? null;

    if (!deliveryUrl) {
      console.error('[cf-images] no delivery URL in response', { imageId });
      return null;
    }

    console.log('[cf-images] upload succeeded', { imageId, deliveryUrl });
    return { imageId, deliveryUrl };
  } catch (e) {
    console.error('[cf-images] upload exception', { error: String(e) });
    return null;
  }
}
