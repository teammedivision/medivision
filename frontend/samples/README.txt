MediVision — Quick-Try Sample Images
====================================

The "Try a sample" buttons on the upload screen load the files in this folder:

    skin.jpg    -> Skin button
    eye.jpg     -> Eye button
    teeth.jpg   -> Dental button

The three files currently here are PLACEHOLDERS so the buttons work out of the
box. They are NOT real medical images and will produce meaningless predictions.

BEFORE THE SHOWCASE, replace each one with a real image from your test set:
  - Pick one clear, correctly-classified image per domain.
  - Keep the exact file names above (skin.jpg, eye.jpg, teeth.jpg).
  - JPG/PNG/WEBP all work; keep them under 10 MB.

Tip: choose images the model predicts confidently and that have a clean
Grad-CAM heatmap — they make the strongest live demo.

v2 NOTE: the backend now rejects non-medical images (the OOD gate), so
these placeholder files will produce a polite rejection instead of a fake
prediction. Replace them with real test-set images before demoing the
sample buttons.
