// スクショの文字を読む（無料・iPhoneの中で処理。画像はどこにも送らない）
// 初回だけ、読み取り用のデータ（数MB）をダウンロードする
(function (root) {
  'use strict';

  let loading = null;
  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = () => { loading = null; reject(new Error('読み取り機能を読み込めませんでした。電波を確認してください')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を開けませんでした')); };
      img.src = url;
    });
  }

  // 画像を指定サイズの JPEG にする（背景画像の保存用）
  async function shrink(file, maxSide, quality) {
    const img = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality || 0.8);
  }

  // 小さい文字も読めるよう、横幅1600px前後に揃えてから読む
  async function prepare(file) {
    const img = await loadImage(file);
    const scale = Math.min(2, Math.max(1, 1600 / img.width));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  async function readImage(file, onProgress) {
    await loadTesseract();
    const worker = await root.Tesseract.createWorker('jpn+eng', 1, {
      logger: (m) => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); },
    });
    const { data } = await worker.recognize(await prepare(file));
    await worker.terminate();
    // 日本語の文字の間に入る余計なスペースを消す
    return data.text
      .replace(/([^\x00-\x7F])[ \t]+(?=[^\x00-\x7F])/g, '$1')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  root.OCR = { readImage, shrink };
})(self);
