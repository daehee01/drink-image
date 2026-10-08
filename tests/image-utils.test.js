import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alphaBounds, cleanAlpha, dropSpecks, fitHeight, pngFilename } from '../image-utils.js';
test('transparent margins are excluded and bottle fits exactly at height 700', () => {
  const pixels = new Uint8ClampedArray(100 * 200 * 4);
  for (let y = 20; y < 180; y++) for (let x = 30; x < 70; x++) pixels[(y * 100 + x) * 4 + 3] = 255;
  pixels[3] = 5;
  const bounds = alphaBounds(pixels, 100, 200);
  assert.deepEqual(bounds, { x: 30, y: 20, width: 40, height: 160 });
  assert.deepEqual(fitHeight(bounds), { x: 262.5, y: 0, width: 175, height: 700 });
});
test('empty image is rejected', () => assert.throws(() => alphaBounds(new Uint8Array(16), 2, 2)));
test('single visible pixel has nonzero dimensions', () => assert.deepEqual(alphaBounds(new Uint8Array([0, 0, 0, 255]), 1, 1), { x: 0, y: 0, width: 1, height: 1 }));
test('wide objects keep aspect ratio and crop equally on both sides', () => assert.deepEqual(fitHeight({ width: 200, height: 100 }), { x: -350, y: 0, width: 1400, height: 700 }));
test('filenames preserve Korean and normalize extensions and path characters', () => {
  assert.equal(pngFilename(' 우리술.png.png '), '우리술.png');
  assert.equal(pngFilename('a/b:c'), 'a-b-c.png');
  assert.equal(pngFilename('...'), '상품이미지-700.png');
});
test('faint source shadow stays faint after removal and is dropped above the cutoff', () => {
  const source = new Uint8Array([0, 0, 0, 30, 0, 0, 0, 255, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(cleanAlpha(new Uint8Array([9, 9, 9, 254, 9, 9, 9, 250, 9, 9, 9, 200]), source)).filter((_, i) => i % 4 === 3), [30, 250, 0]);
  assert.deepEqual(Array.from(cleanAlpha(new Uint8Array([9, 9, 9, 254, 9, 9, 9, 250, 9, 9, 9, 200]), source, 64)).filter((_, i) => i % 4 === 3), [0, 250, 0]);
});
test('a distant speck is cleared so it cannot widen the bounds', () => {
  const pixels = new Uint8ClampedArray(100 * 100 * 4);
  for (let y = 20; y < 100; y++) for (let x = 60; x < 80; x++) pixels[(y * 100 + x) * 4 + 3] = 255;
  pixels[(0 * 100 + 5) * 4 + 3] = 200; pixels[(0 * 100 + 6) * 4 + 3] = 200;
  assert.equal(alphaBounds(pixels, 100, 100).x, 5);
  dropSpecks(pixels, 100, 100);
  assert.deepEqual(alphaBounds(pixels, 100, 100), { x: 60, y: 20, width: 20, height: 80 });
});
test('two large objects are both kept', () => {
  const pixels = new Uint8ClampedArray(100 * 100 * 4);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 20; x++) { pixels[(y * 100 + x) * 4 + 3] = 255; pixels[(y * 100 + x + 70) * 4 + 3] = 255; }
  dropSpecks(pixels, 100, 100);
  assert.deepEqual(alphaBounds(pixels, 100, 100), { x: 0, y: 0, width: 90, height: 100 });
});
