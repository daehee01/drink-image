self.onmessage = async ({ data: blob }) => {
  try {
    const { removeBackground } = await import('https://esm.sh/@imgly/background-removal@1.7.0?deps=onnxruntime-web@1.21.0');
    const result = await removeBackground(blob, {
      model: 'isnet_fp16', device: 'cpu', proxyToWorker: false,
      output: { format: 'image/png' },
      progress: (key, current, total) => self.postMessage({ type: 'progress', key, current, total })
    });
    self.postMessage({ type: 'result', blob: result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
