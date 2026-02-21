/**
 * Consume a readable stream and return its contents as a single Buffer.
 * @param {import('stream').Readable} stream - The readable stream to consume
 * @returns {Promise<Buffer>}
 */
export async function toBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', (err) => {
      reject(err);
    });
  });
}
