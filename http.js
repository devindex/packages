/**
 * Normalize a URL by prepending "https:" if it starts with "//".
 * @param {string} url - The URL to normalize
 * @returns {string}
 */
export function normalizeURLProtocol(url) {
  return url.startsWith('//') ? `https:${url}` : url;
}

/**
 * Fetch a URL and return its contents as an ArrayBuffer.
 * @param {string} url - The URL to fetch
 * @param {Object} [options={}] - Request options
 * @param {Object} [options.headers={}] - Additional request headers
 * @returns {Promise<ArrayBuffer>}
 */
export async function getAsArrayBuffer(url, { headers = {} } = {}) {
  const response = await fetch(normalizeURLProtocol(url), {
    headers: {
      Accept: 'text/plain,*/*',
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * Fetch a PDF from a URL and return it as an ArrayBuffer.
 * @param {string} url - The PDF URL
 * @returns {Promise<ArrayBuffer>}
 */
export function getPDFAsArrayBuffer(url) {
  return getAsArrayBuffer(url, {
    headers: {
      Accept: 'application/pdf,*/*',
    },
  });
}

/**
 * Fetch an image from a URL and return it as an ArrayBuffer.
 * @param {string} url - The image URL
 * @returns {Promise<ArrayBuffer>}
 */
export function getImageAsArrayBuffer(url) {
  return getAsArrayBuffer(url, {
    headers: {
      Accept: 'image/png,image/jpg,*/*',
    },
  });
}
