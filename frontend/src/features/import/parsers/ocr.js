// Tesseract.js OCR. The worker, WASM core and English language data are fetched
// on first use (from the jsDelivr CDN by default) and then cached by the browser.
let workerPromise = null;
let progressListener = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) =>
      createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && progressListener) progressListener(m.progress);
        },
      })
    ).catch((err) => {
      workerPromise = null;
      throw new Error(`Couldn’t start text recognition (OCR). Check your internet connection. (${err.message})`);
    });
  }
  return workerPromise;
}

// image: File | Blob | HTMLCanvasElement. onProgress receives 0..1.
export async function recognize(image, onProgress) {
  const worker = await getWorker();
  progressListener = onProgress;
  try {
    const { data } = await worker.recognize(image);
    return data.text || '';
  } finally {
    progressListener = null;
  }
}
