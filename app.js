import { alphaBounds, cleanAlpha, fitHeight, pngFilename } from './image-utils.js';
const $ = id => document.getElementById(id);
let selected = null, originalURL = null, outputURL = null, busy = false, worker = null, selection = 0, readingClipboard = false;
const status = (message, error = false) => { $('status').textContent = message; $('status').parentElement.classList.toggle('error', error); };
function showTab(original) {
  $('original').hidden = !original || !selected;
  $('result').hidden = original || !outputURL;
  $('empty').hidden = Boolean(original ? selected : outputURL);
  $('originalTab').setAttribute('aria-pressed', String(original));
  $('resultTab').setAttribute('aria-pressed', String(!original));
  $('previewCaption').textContent = original ? '업로드한 원본 이미지' : '체크무늬는 투명 배경이에요';
}
function clearResult() {
  if (outputURL) URL.revokeObjectURL(outputURL);
  outputURL = null; $('download').disabled = true; $('result').hidden = true;
}
function setBusy(value) {
  busy = value; $('file').disabled = value; $('skip').disabled = value; $('shadow').disabled = value;
  $('paste').disabled = value || readingClipboard;
  $('process').disabled = value || !selected; $('cancel').hidden = !value;
  $('progress').hidden = !value;
  if (value) $('progress').removeAttribute('value');
}
async function selectFile(file) {
  if (!file || busy) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return status('JPG, PNG, WebP 형식만 사용할 수 있어요.', true);
  if (file.size > 20 * 1024 * 1024) return status('20MB 이하의 이미지를 선택해 주세요.', true);
  const token = ++selection;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap; bitmap.close();
    if (width * height > 40000000) throw new Error('이미지가 너무 커요. 4,000만 픽셀 이하로 줄여 주세요.');
    if (token !== selection) return;
    clearResult(); if (originalURL) URL.revokeObjectURL(originalURL);
    selected = file; originalURL = URL.createObjectURL(file); $('original').src = originalURL;
    $('filename').value = file.name.replace(/\.[^.]+$/, '') + '-700';
    $('fileInfo').textContent = `${file.name} · ${width.toLocaleString()} × ${height.toLocaleString()}px`;
    $('originalTab').disabled = false; $('process').disabled = false;
    showTab(true); status('준비됐어요. 아래 버튼을 눌러 이미지를 완성하세요.');
  } catch (error) { if (token === selection) status(error.message || '이미지를 읽을 수 없어요.', true); }
}
function remove(blob) {
  return new Promise((resolve, reject) => {
    worker = new Worker(new URL('./removal-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'result') resolve(data.blob);
      else if (data.type === 'error') reject(new Error(data.message));
      else if (data.type === 'progress') {
        const downloading = data.key.startsWith('fetch:');
        status(downloading ? '처리 모델을 준비하고 있어요. 첫 실행은 몇 분 걸릴 수 있어요.' : '병과 배경을 분리하고 있어요…');
        if (downloading && data.total > 0 && data.current < data.total) { $('progress').max = data.total; $('progress').value = data.current; }
        else $('progress').removeAttribute('value');
      }
    };
    worker.onerror = () => reject(new Error('배경 제거 모듈을 불러오지 못했어요.'));
    worker.postMessage(blob);
    // Terminating the worker also settles the pending operation.
    worker.cancel = () => reject(new DOMException('취소됨', 'AbortError'));
  });
}
async function normalizeInput(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const toBlob = () => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했어요.')), 'image/png'));
  const blob = await toBlob();
  // The model reads transparent pixels as black, which makes dark caps look like
  // background and dark shadows look like bottle. Show it the image on white.
  ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { blob, flat: await toBlob(), pixels };
}
$('process').onclick = async () => {
  if (!selected || busy) return;
  clearResult(); setBusy(true); status('이미지를 준비하고 있어요…');
  let cancelled = false;
  $('cancel').onclick = () => { cancelled = true; worker?.cancel(); worker?.terminate(); status('처리를 취소하고 있어요…'); };
  try {
    const input = await normalizeInput(selected);
    if (cancelled) throw new DOMException('취소됨', 'AbortError');
    const blob = $('skip').checked ? input.blob : await remove(input.flat);
    if (cancelled) throw new DOMException('취소됨', 'AbortError');
    const bitmap = await createImageBitmap(blob);
    const source = document.createElement('canvas'); source.width = input.pixels.width; source.height = input.pixels.height;
    const ctx = source.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0, source.width, source.height); bitmap.close();
    const pixels = ctx.getImageData(0, 0, source.width, source.height);
    if ($('skip').checked && !pixels.data.some((value, i) => i % 4 === 3 && value < 255)) throw new Error('투명 배경이 없는 이미지예요. 체크를 해제하고 배경을 제거해 주세요.');
    // Colors come from the source; the model only contributes its mask.
    cleanAlpha(input.pixels.data, pixels.data, $('shadow').checked ? 64 : 0); ctx.putImageData(input.pixels, 0, 0);
    const bounds = alphaBounds(pixels.data, source.width, source.height), dest = fitHeight(bounds);
    const out = $('result').getContext('2d'); out.clearRect(0, 0, 700, 700);
    out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
    out.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, dest.x, 0, dest.width, 700);
    const png = await new Promise(resolve => $('result').toBlob(resolve, 'image/png'));
    if (!png) throw new Error('이미지 생성에 실패했어요. 다시 시도해 주세요.');
    if (cancelled) throw new DOMException('취소됨', 'AbortError');
    outputURL = URL.createObjectURL(png); $('download').disabled = false; showTab(false);
    status(dest.width > 700 ? '완료! 가로가 넓어 좌우 일부가 잘렸어요. 미리보기를 확인하세요.' : '완료! 파일명을 정하고 이미지를 내려받으세요.');
  } catch (error) {
    if (error.name === 'AbortError') status('처리를 취소했어요. 다시 시작할 수 있어요.');
    else { console.error(error); status(`${error.message} 인터넷 연결을 확인하거나 다른 사진으로 다시 시도해 주세요.`, true); }
  } finally { worker?.terminate(); worker = null; setBusy(false); }
};
$('file').onchange = event => { selectFile(event.target.files[0]); event.target.value = ''; };
function clipboardFile(blob) {
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] || 'png';
  return new File([blob], `붙여넣기-${Date.now()}.${extension}`, { type: blob.type });
}
document.addEventListener('paste', event => {
  const item = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
  if (!item) return; // Keep normal text paste, including the filename field.
  event.preventDefault();
  if (busy) return;
  const file = item.getAsFile();
  if (file) selectFile(clipboardFile(file));
});
$('paste').onclick = async () => {
  if (busy || readingClipboard) return;
  if (!navigator.clipboard?.read) return status('이 브라우저에서는 ⌘V 또는 Ctrl+V로 이미지를 붙여넣어 주세요.');
  readingClipboard = true; $('paste').disabled = true;
  const previousSelection = selection;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(type => ['image/png', 'image/jpeg', 'image/webp'].includes(type));
      if (!type) continue;
      const blob = await item.getType(type);
      if (busy || previousSelection !== selection) return;
      await selectFile(clipboardFile(blob));
      return;
    }
    if (!busy && previousSelection === selection) status('복사된 이미지가 없어요. 이미지 자체를 복사하거나 스크린샷을 복사한 뒤 다시 눌러 주세요.', true);
  } catch (error) {
    if (!busy && previousSelection === selection) status(error.name === 'NotAllowedError'
      ? '클립보드 접근이 허용되지 않았어요. ⌘V 또는 Ctrl+V로 붙여넣어 주세요.'
      : '클립보드를 읽지 못했어요. ⌘V 또는 Ctrl+V로 붙여넣어 주세요.', true);
  } finally { readingClipboard = false; $('paste').disabled = busy; }
};
for (const name of ['dragenter', 'dragover']) $('dropzone').addEventListener(name, event => { event.preventDefault(); if (!busy) $('dropzone').classList.add('drag'); });
for (const name of ['dragleave', 'drop']) $('dropzone').addEventListener(name, event => { event.preventDefault(); $('dropzone').classList.remove('drag'); });
$('dropzone').addEventListener('drop', event => selectFile(event.dataTransfer.files[0]));
window.addEventListener('dragover', event => event.preventDefault()); window.addEventListener('drop', event => event.preventDefault());
$('originalTab').onclick = () => showTab(true); $('resultTab').onclick = () => showTab(false);
$('download').onclick = () => { if (!outputURL) return; const a = document.createElement('a'); a.href = outputURL; a.download = pngFilename($('filename').value); document.body.append(a); a.click(); a.remove(); };
