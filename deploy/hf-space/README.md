---
title: MediVision
emoji: 🩺
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: other
short_description: AI screening for skin, eye, and dental images (research preview).
---

# MediVision

AI-powered visual screening for skin, eye, and dental conditions. Upload a
close-up photo — the app routes it to the right ResNet50 model, returns ranked
predictions with a Grad-CAM heatmap, and gives a severity-based recommendation.

**Not a medical device.** Educational/research use only — not a diagnosis and
not medical advice. Always consult a qualified healthcare professional.

Source code: https://github.com/teammedivision/medivision

This Space builds from a Dockerfile that fetches the code and the four model
files automatically. To update it after pushing to GitHub, use **Settings →
Factory rebuild**.
