# MediVision Model Card

> Honest, published model documentation is a credibility requirement for any
> medical-AI startup. Metrics below are the ResNet50 (production) results from
> the MediVision Part E Final Report. Keep this in sync with
> `api/model_metrics.json` (served at `GET /api/model-info`).
>
> Last updated: 2026-08-10.

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

The unified corpus contains **35,884 deduplicated images across 24 disease
classes** in three domains, aggregated from public Kaggle, ISIC, and Roboflow
datasets, plus a **4,500-image** subset used to train the domain router.

- **Split:** 70 / 15 / 15 train / validation / test, stratified by class and
  verified free of path-level leakage between splits.
- **Rebalancing:** Melanocytic Nevus capped at 3,500 training samples; seven
  minority skin classes upsampled to 2,000 each; Dry Eye and Uveitis augmented
  with 150 neural-style-transfer synthetic images each.
- **Deduplication:** a 16×16 grayscale average-hash perceptual filter removed
  5,855 duplicates (976 skin, 27 eye, 4,852 teeth) that were inflating counts
  and risking train/test leakage.
- **Approx. per-domain size:** skin ≈ 18.5K images (11 classes), teeth ≈ 11K
  (7 classes), eye ≈ 1.9K (6 classes).

**Still to document:** exact dataset versions/licenses and demographic
composition (skin tones / Fitzpatrick types, age, capture devices). Known skew
is listed under Limitations.

## Performance

Held-out **test-set** results for the production **ResNet50** models (bootstrap
95% CIs, 1,000 resamples). Kept in sync with `api/model_metrics.json`.

| Model | Top-1 Acc | Top-3 Acc | Macro F1 | Wtd F1 | Macro AUC | Clinically critical metric |
|---|---|---|---|---|---|---|
| Domain router | 99.56% | 100.0% | 0.996 | 0.996 | ≈1.00 | 3 misroutes / 675 images |
| Skin (11-class) | 83.94% | 96.74% | 0.775 | 0.841 | 0.981 | **Melanoma sensitivity 0.96** (F1 0.97, AUC 0.999) |
| Eye (6-class) | 93.99% | 99.76% | 0.928 | 0.939 | 0.996 | Macro AUC 0.996 |
| Dental (7-class) | 95.71% | 99.45% | 0.925 | 0.955 | 0.986 | **Caries recall 0.53** (36 samples) |

**End-to-end pipeline accuracy: 85.91%** on a 5,648-image stress test.

Confidence intervals: Domain [98.96%, 99.93%], Skin [82.79%, 85.12%].

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
- **Caries recall (0.53):** the dental Caries class has only 36 test samples;
  precision is perfect (1.00) but the model misses about half of true caries
  cases. Highest-priority fix on the roadmap (more caries data + augmentation).
- Inflammatory dermatoses (Atopic Dermatitis F1 0.56, Psoriasis F1 0.62) are
  frequently confused with each other due to overlapping visual presentation.
- Domain-routing artefact sensitivity: the router may partly rely on
  source-dataset artefacts (lighting, camera type, crop patterns) rather than
  purely clinical features — a risk for real-world generalization.

## Retraining Roadmap (path to a credible medical product)

1. Expand datasets with licensed clinical data; stratify by demographics.
2. Add a trained OOD/"other" class using diverse negative images.
3. Calibrate probabilities (temperature scaling) and show calibrated ranges.
4. Ensemble or upgrade backbones (EfficientNet/ViT) and compare.
5. External validation on a dataset never seen during development.
6. Prospective clinical validation study with dermatologist/ophthalmologist/
   dentist ground truth — required for any regulatory submission.

## Contact

Maintainers: Arnav Mehta and Yash Hingu. Contact: **team.medivision@gmail.com**.
