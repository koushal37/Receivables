import { extractInvoiceFromText } from '../extract/textExtractor.js';
import { recognize } from './ocr.js';

const isHeic = (file) => /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type);

export async function parse(file, { onProgress = () => {} } = {}) {
  let image = file;
  if (isHeic(file)) {
    onProgress({ stage: 'Converting HEIC photo', progress: 0.05 });
    const { default: heic2any } = await import('heic2any');
    try {
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      image = Array.isArray(out) ? out[0] : out;
    } catch {
      throw new Error('This HEIC photo couldn’t be converted. Try exporting it as JPG.');
    }
  }

  // Make sure the browser can decode the image before spending time on OCR
  try {
    const bitmap = await createImageBitmap(image);
    bitmap.close();
  } catch {
    throw new Error('This image is damaged or in an unsupported encoding.');
  }

  const text = await recognize(image, (p) => onProgress({ stage: 'Recognizing text', progress: 0.1 + p * 0.9 }));
  const fields = extractInvoiceFromText(text);
  fields.warnings.push('Read from an image using OCR. Please double-check the values.');
  return [{ fields, method: 'ocr' }];
}
