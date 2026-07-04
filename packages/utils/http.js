/**
 * Base request wrapper that handles URL normalization, error checking, and automatic response parsing.
 * @param {string} url - The URL to fetch
 * @param {Object} [options={}] - Fetch options
 * @param {'json'|'text'|'blob'|'arrayBuffer'} [options.type='json'] - Response type
 * @returns {Promise<*>}
 */
export async function request(url, options = {}) {
  const { responseType = 'json', ...fetchOptions } = options;

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  switch (responseType) {
    case 'text':
      return response.text();
    case 'blob':
      return response.blob();
    case 'arrayBuffer':
      return response.arrayBuffer();
    case 'json':
      return response.json();
    default:
      return response.json();
  }
}

/**
 * Perform a GET request.
 * @param {string} url - The URL to fetch
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<Response>}
 */
export function get(url, options = {}) {
  return request(url, { ...options, method: 'GET' });
}

/**
 * Perform a POST request with JSON body.
 * @param {string} url - The URL to fetch
 * @param {*} body - The request body (will be JSON.stringify if object)
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<Response>}
 */
export function post(url, body, options = {}) {
  return request(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * Perform a PUT request with JSON body.
 * @param {string} url - The URL to fetch
 * @param {*} body - The request body (will be JSON.stringify if object)
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<Response>}
 */
export function put(url, body, options = {}) {
  return request(url, {
    ...options,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * Perform a DELETE request.
 * @param {string} url - The URL to fetch
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<Response>}
 */
export function del(url, options = {}) {
  return request(url, { ...options, method: 'DELETE' });
}

/**
 * Perform a PATCH request with JSON body.
 * @param {string} url - The URL to fetch
 * @param {*} body - The request body (will be JSON.stringify if object)
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<Response>}
 */
export function patch(url, body, options = {}) {
  return request(url, {
    ...options,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

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
  return get(normalizeURLProtocol(url), {
    headers: {
      Accept: 'text/plain,*/*',
      ...headers,
    },
    responseType: 'arrayBuffer',
  });
}

/**
 * Fetch a PDF from a URL and return it as an ArrayBuffer.
 * @param {string} url - The PDF URL
 * @returns {Promise<ArrayBuffer>}
 */
export function getPDFAsArrayBuffer(url) {
  return get(normalizeURLProtocol(url), {
    headers: {
      Accept: 'application/pdf,*/*',
    },
    responseType: 'arrayBuffer',
  });
}

/**
 * Fetch an image from a URL and return it as an ArrayBuffer.
 * @param {string} url - The image URL
 * @returns {Promise<ArrayBuffer>}
 */
export function getImageAsArrayBuffer(url) {
  return get(normalizeURLProtocol(url), {
    headers: {
      Accept: 'image/png,image/jpg,*/*',
    },
    responseType: 'arrayBuffer',
  });
}
