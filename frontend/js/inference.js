/* =========================================================
 * MediVision — in-browser inference (TensorFlow.js).
 *
 * Proof of concept: runs the DOMAIN model (skin / eye / teeth router)
 * entirely in the browser, so no Python server is needed. Mirrors the
 * backend's preprocessing and prediction exactly (see api/models/loader.py):
 *
 *   - resize to 224x224
 *   - ResNet50 "caffe" preprocessing: RGB -> BGR, subtract the ImageNet
 *     BGR mean [103.939, 116.779, 123.68]; NO 0..1 rescale
 *   - the model already ends in softmax, so its output is used directly
 *     as probabilities (no extra softmax)
 *
 * Requires tf.js to be loaded first (window.tf).
 * ========================================================= */
(function () {
  'use strict';

  // Must match DOMAIN_CLASSES in api/models/loader.py (alphabetical training order).
  const DOMAIN_CLASSES = ['eye', 'skin', 'teeth'];
  const DOMAIN_INPUT = 224;
  // ResNet50 caffe-mode mean, in BGR channel order.
  const BGR_MEAN = [103.939, 116.779, 123.68];

  let domainModel = null;

  function tfReady() {
    return typeof window.tf !== 'undefined';
  }

  /* Load the converted domain model. `onProgress` gets 0..1. */
  async function loadDomainModel(basePath, onProgress) {
    if (!tfReady()) throw new Error('TensorFlow.js not loaded');
    if (domainModel) return domainModel;
    const url = (basePath || 'models/domain') + '/model.json';
    domainModel = await tf.loadLayersModel(url, {
      onProgress: (f) => { if (onProgress) onProgress(f); },
    });
    return domainModel;
  }

  /* Turn an <img>/<canvas>/ImageData into the exact tensor the model expects. */
  function preprocess(pixels, size) {
    return tf.tidy(() => {
      let img = tf.browser.fromPixels(pixels);              // [h,w,3] RGB, 0..255
      img = tf.image.resizeBilinear(img, [size, size]);     // note: backend uses PIL;
      img = tf.cast(img, 'float32');                        // bilinear is a close match
      // RGB -> BGR
      const [r, g, b] = tf.split(img, 3, 2);
      img = tf.concat([b, g, r], 2);
      // subtract per-channel BGR mean (no rescale — matches keras caffe mode)
      const mean = tf.tensor1d(BGR_MEAN);
      img = tf.sub(img, mean);
      return tf.expandDims(img, 0);                         // [1,size,size,3]
    });
  }

  /* Predict skin / eye / teeth for an image element. */
  async function predictDomain(pixels) {
    if (!domainModel) throw new Error('Domain model not loaded');
    const t0 = performance.now();

    const input = preprocess(pixels, DOMAIN_INPUT);
    let probs;
    try {
      const out = domainModel.predict(input);
      probs = Array.from(await out.data());   // already softmax probabilities
      out.dispose();
    } finally {
      input.dispose();
    }

    let topIdx = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topIdx]) topIdx = i;

    const scores = {};
    DOMAIN_CLASSES.forEach((c, i) => { scores[c] = probs[i]; });

    return {
      domain: DOMAIN_CLASSES[topIdx],
      confidence: probs[topIdx],
      scores,
      ms: Math.round(performance.now() - t0),
    };
  }

  function isLoaded() { return !!domainModel; }

  window.MVInference = {
    loadDomainModel,
    predictDomain,
    preprocess,          // exposed for the preprocessing self-test
    isLoaded,
    DOMAIN_CLASSES,
    BGR_MEAN,
    DOMAIN_INPUT,
  };
})();
