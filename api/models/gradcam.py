"""Grad-CAM for Keras 3.

The disease classifiers wrap a ResNet50 functional submodel as one of the
top-level layers; the Conv2D layers live inside that submodel, not at the
top level. This implementation:

  1. Walks model.layers and locates the last Conv2D inside the nested
     submodel (the one whose `hasattr(layer, 'layers')` is True).
  2. Builds a Grad-CAM model by re-threading the head layers after the
     submodel. Layer objects are *reused* so weights are shared.
  3. Computes gradients via tf.GradientTape, ReLU-thresholds and resizes the
     heatmap, applies a JET colormap, and blends it over the input image.
  4. Returns a base64-encoded PNG string.
"""
import base64
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, Model
import cv2


def _locate_target_conv(model):
    """Return (target_conv_layer, parent_submodel_or_None).

    parent is the wrapper layer that owns the Conv2D, or None if the Conv2D
    sits at the top level of `model`.
    """
    target = None
    parent = None
    for layer in model.layers:
        if hasattr(layer, 'layers'):
            for sub in layer.layers:
                if isinstance(sub, layers.Conv2D):
                    target = sub
                    parent = layer
        elif isinstance(layer, layers.Conv2D):
            target = layer
            parent = None
    if target is None:
        raise ValueError('No Conv2D layer found in model')
    return target, parent


def _build_gradcam_model(model):
    """Build a tf.keras.Model that outputs (conv_features, predictions).

    Handles two cases:
      * Conv2D at top level -> simple multi-output wrapper.
      * Conv2D inside a nested submodel -> auxiliary base + head re-threading.
    """
    target_conv, parent = _locate_target_conv(model)

    if parent is None:
        return Model(inputs=model.inputs,
                     outputs=[target_conv.output, model.output])

    aux_base = Model(
        inputs=parent.input,
        outputs=[target_conv.output, parent.output],
        name=f'gradcam_aux_{parent.name}',
    )
    new_input = layers.Input(shape=tuple(model.inputs[0].shape[1:]))
    conv_out, base_out = aux_base(new_input)
    x = base_out
    after_parent = False
    for layer in model.layers:
        if layer is parent:
            after_parent = True
            continue
        if after_parent:
            x = layer(x)
    return Model(inputs=new_input, outputs=[conv_out, x],
                 name=f'gradcam_full_{model.name}')


def _compute_heatmap(grad_model, batch_array, pred_class_idx):
    img_t = tf.cast(batch_array, tf.float32)
    with tf.GradientTape() as tape:
        tape.watch(img_t)
        conv_out, preds = grad_model(img_t)
        loss = preds[:, pred_class_idx]
    grads = tape.gradient(loss, conv_out)
    if grads is None:
        h, w = int(conv_out.shape[1]), int(conv_out.shape[2])
        return np.zeros((h, w), dtype=np.float32)
    pooled = tf.reduce_mean(grads, axis=(0, 1, 2))
    heatmap = tf.squeeze(conv_out[0] @ pooled[..., tf.newaxis]).numpy()
    heatmap = np.maximum(heatmap, 0)
    if heatmap.max() > 0:
        heatmap /= heatmap.max()
    return heatmap


def _overlay(raw_uint8, heatmap, alpha=0.45):
    h, w = raw_uint8.shape[:2]
    heatmap_resized = cv2.resize(heatmap, (w, h))
    heatmap_uint8 = np.uint8(255 * heatmap_resized)
    coloured = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    coloured = cv2.cvtColor(coloured, cv2.COLOR_BGR2RGB)
    blended = np.uint8(coloured * alpha + raw_uint8 * (1 - alpha))
    return blended


def generate_gradcam_overlay(model, img_array, pred_class_idx,
                             original_uint8=None):
    """Generate Grad-CAM and return base64 PNG string of the overlay.

    Args:
        model: the disease classifier (nested ResNet50 inside).
        img_array: 1xHxWx3 preprocessed input batch (what the model expects).
        pred_class_idx: the class to explain.
        original_uint8: HxWx3 uint8 source image to draw the overlay on. If
                        None, falls back to the preprocessed array.
    """
    grad_model = _build_gradcam_model(model)
    heatmap = _compute_heatmap(grad_model, img_array, pred_class_idx)

    if original_uint8 is None:
        canvas = np.clip(img_array[0], 0, 255).astype(np.uint8)
    else:
        canvas = original_uint8

    overlay = _overlay(canvas, heatmap, alpha=0.45)

    bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode('.png', bgr)
    if not ok:
        raise RuntimeError('Failed to encode Grad-CAM PNG')
    return base64.b64encode(buf.tobytes()).decode('ascii')
