# MediVision Model Card

> Honest, published model documentation is a credibility requirement for any
> medical-AI startup. Fill in every **TODO** from your training notebook
> before showing this to users, investors, or partners. Keep it in sync with
> `api/model_metrics.json` (served at `GET /api/model-info`).

## Overview

MediVision uses a two-stage pipeline of four fine-tuned ResNet50 CNNs:

| Model | Input | Classes | Role |
|---|---|---|---|
| Domain router | 224×224 | eye, skin, teeth | Routes the image to a specialist model |
| Skin classifier | 224×224 | 11 conditions | Dermatology screening |
| Eye classifier | 384×384 | 6 conditions | Ocular screening |
| Dental classifier | 224×224 | 7 conditions | Oral screening |

Every prediction ships with a Grad-CAM heat-map, a severity triage tier, and
a plain-language explanation.

## Intended Use

- Educational and research screening of close-up skin, eye, and dental photos.
- Producing a ranked list of *possible* conditions to discuss with a clinician.

## Out-of-Scope Uses (do not do these)

- Clinical diagnosis or treatment decisions of any kind.
- Screening of children's images, X-rays, dermoscopy with instruments not in
  the training data, or any image type not represented in training.
- Deployment in any jurisdiction as a medical device without regulatory
  clearance (FDA 510(k)/De Novo in the US, EU MDR/CE marking, TGA in
  Australia). MediVision currently has **no** regulatory clearance.

## Training Data

**TODO — document precisely:**
- Sources (ISIC dermatology collections, Mendeley eye imagery, Roboflow
  dental sets — list the exact dataset versions and licenses).
- Number of images per class after de-duplication, and train/val/test splits.
- Demographic composition where known (skin tones / Fitzpatrick types, age
  groups, capture devices). Known skew must be listed under Limitations.

## Performance

**TODO — replace with real held-out test-set numbers** (also update
`api/model_metrics.json` and the four `data-metric` values in
`frontend/index.html`):

| Model | Top-1 Acc | Macro F1 | AUC | Clinically critical metric |
|---|---|---|---|---|
| Domain router | TODO | TODO | — | Routing error rate |
| Skin | TODO | TODO | TODO | **Melanoma sensitivity** (report separately) |
| Eye | TODO | TODO | TODO | Uveitis sensitivity |
| Dental | TODO | TODO | TODO | Caries sensitivity |

Note on calibration: softmax confidence is not a calibrated probability. A
displayed "87%" does not mean 87% chance of being correct. Roadmap: apply
temperature scaling on the validation set and report ECE (expected
calibration error).

## Out-of-Distribution Handling

Non-medical images are rejected by a heuristic gate on the domain router's
softmax output (confidence ≥ 0.70 and normalized entropy ≤ 0.90 — both
configurable via env vars). This is **not** a trained OOD detector; images
that fool the router will still be classified.

## Known Limitations

- Small class coverage (11/6/7 conditions) vs. hundreds seen in practice; a
  condition outside the class list will be *forced* into one of the known
  classes.
- Public-dataset bias: lighter skin tones are over-represented in most public
  dermatology sets; expect degraded performance on darker skin tones until
  measured and corrected.
- Single-image, single-model inference; no ensembling, no test-time
  augmentation, no uncertainty estimation beyond softmax.
- Image-quality sensitivity: blur, poor lighting, and occlusion degrade
  accuracy silently (low-confidence flag partially mitigates this).

## Retraining Roadmap (path to a credible medical product)

1. Expand datasets with licensed clinical data; stratify by demographics.
2. Add a trained OOD/"other" class using diverse negative images.
3. Calibrate probabilities (temperature scaling) and show calibrated ranges.
4. Ensemble or upgrade backbones (EfficientNet/ViT) and compare.
5. External validation on a dataset never seen during development.
6. Prospective clinical validation study with dermatologist/ophthalmologist/
   dentist ground truth — required for any regulatory submission.

## Contact

Maintainers: Yash Hingu and team. Update this card with a contact email
before public launch.
