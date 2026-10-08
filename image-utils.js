export function alphaBounds(data, width, height, threshold = 8) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > threshold) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error('병을 찾지 못했어요. 다른 사진으로 시도해 주세요.');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
// Combine source alpha with the removal mask, keeping the more transparent
// value, then drop what is still faint (soft shadows, haze) when cutoff > 0.
export function cleanAlpha(data, mask, cutoff = 0) {
  for (let i = 3; i < data.length; i += 4) {
    const alpha = Math.min(data[i], mask[i]);
    data[i] = alpha < cutoff ? 0 : alpha;
  }
  return data;
}
// Clear blobs much smaller than the largest one (dust, specks the model left in
// a corner) so they can't stretch the bounds and pull the bottle off center.
export function dropSpecks(data, width, height, threshold = 8, minRatio = 0.01) {
  const label = new Int32Array(width * height), sizes = [0], stack = [];
  for (let start = 0; start < label.length; start++) {
    if (label[start] || data[start * 4 + 3] <= threshold) continue;
    const id = sizes.length; let size = 0;
    label[start] = id; stack.push(start);
    while (stack.length) {
      const p = stack.pop(), x = p % width; size++;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q >= 0 && q < label.length && !label[q] && data[q * 4 + 3] > threshold) { label[q] = id; stack.push(q); }
      }
    }
    sizes.push(size);
  }
  const keep = sizes.reduce((a, b) => Math.max(a, b), 0) * minRatio;
  for (let p = 0; p < label.length; p++) if (label[p] && sizes[label[p]] < keep) data[p * 4 + 3] = 0;
  return data;
}
export function fitHeight(bounds, size = 700) {
  const width = bounds.width * size / bounds.height;
  return { x: (size - width) / 2, y: 0, width, height: size };
}
export function pngFilename(value) {
  const name = value.trim().replace(/(?:\.png)+$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100);
  return `${name || '상품이미지-700'}.png`;
}
