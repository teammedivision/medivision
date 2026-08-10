/* =========================================================
 * MediVision frontend — state machine + API client.
 * Three states: LANDING -> UPLOAD -> RESULTS.
 * No frameworks, no build step.
 * ========================================================= */
(function () {
  'use strict';

  // Same-origin by default (works locally and once tunneled/deployed behind
  // a single URL, since app.py now serves this frontend too). Falls back to
  // localhost:5000 only if this file is still being served the old way, via
  // `python -m http.server 8080` instead of through the Flask app.
  const API_BASE = (location.port === '8080') ? 'http://localhost:5000' : '';
  const MAX_BYTES = 10 * 1024 * 1024;
  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
  const LOW_CONFIDENCE_THRESHOLD = 0.50;
  const GAUGE_CIRC = 2 * Math.PI * 54;   // matches r=54 in the SVG

  const STATES = {
    HOME: 'screen-home', HOW: 'screen-how', ABOUT: 'screen-about',
    UPLOAD: 'screen-upload', RESULTS: 'screen-results',
  };
  const SCREEN_BY_KEY = {
    home: 'screen-home', how: 'screen-how', about: 'screen-about',
    upload: 'screen-upload', results: 'screen-results',
  };
  const URGENT_DISEASES = new Set([
    'Melanoma', 'Basal Cell Carcinoma', 'Actinic Keratosis', 'Uveitis',
  ]);

  /* -------------------------------------------------
   * Lay descriptions — one short sentence per class.
   * ------------------------------------------------- */
  const DISEASE_DESCRIPTIONS = {
    'Acne':                 'A common skin condition involving clogged pores and inflammation.',
    'Actinic Keratosis':    'A pre-cancerous rough patch caused by long-term sun damage.',
    'Atopic Dermatitis':    'A chronic, itchy inflammation of the skin (a form of eczema).',
    'Basal Cell Carcinoma': 'A common, slow-growing form of skin cancer requiring removal.',
    'Benign Keratosis':     'A non-cancerous, waxy skin growth that needs no treatment.',
    'Eczema':               'An itchy inflammatory skin condition with red, dry patches.',
    'Melanocytic Nevus':    'A common mole — a benign cluster of pigmented skin cells.',
    'Melanoma':             'A potentially serious form of skin cancer requiring prompt evaluation.',
    'Psoriasis':            'A chronic autoimmune condition causing thick, scaly plaques.',
    'Seborrheic Keratosis': 'A harmless, waxy growth more common with age.',
    'Tinea':                'A fungal skin infection often appearing as a ring-shaped rash.',
    'Urticaria':            'Hives — itchy raised welts usually triggered by an allergic reaction.',
    'Vitiligo':             'A condition where skin loses pigment in patches.',
    'Warts':                'Small rough growths caused by a viral skin infection.',
    'Cataract':             'Clouding of the eye lens that can blur vision over time.',
    'Conjunctivitis':       'Inflammation of the eye surface, commonly known as pink eye.',
    'Dry Eye':              'A condition where the eyes do not produce enough tears.',
    'Eyelid Drooping':      'Sagging of the upper eyelid (ptosis), sometimes affecting vision.',
    'Uveitis':              'Inflammation inside the eye that can threaten vision if untreated.',
    'Calculus':             'Hardened plaque (tartar) on teeth requiring professional removal.',
    'Caries':               'Tooth decay caused by bacterial acid erosion of enamel.',
    'Discoloration':        'Staining or yellowing of teeth, usually cosmetic in nature.',
    'Gingivitis':           'Early-stage gum inflammation, usually reversible with good hygiene.',
    'Hypodontia':           'A developmental condition where one or more teeth are missing.',
    'Mouth Ulcer':          'A small painful sore on the lining of the mouth.',
    'Normal':               'No significant abnormality detected in this screening.',
  };

  /* -------------------------------------------------
   * Condition knowledge base — symptoms, precautions,
   * and a "when to see a doctor" note for every class.
   * Educational, general guidance only.
   * ------------------------------------------------- */
  const CONDITION_INFO = {
    /* ---------- SKIN ---------- */
    'Acne': {
      symptoms: ['Whiteheads & blackheads', 'Red, tender pimples', 'Pus-filled bumps', 'Oily skin', 'Clogged pores', 'Occasional scarring'],
      precautions: ['Wash the area twice daily with a gentle, non-comedogenic cleanser', 'Avoid picking or squeezing lesions to prevent scarring', 'Use oil-free, non-comedogenic skincare and makeup', 'Keep hair and hands away from the face', 'Stay hydrated and limit high-sugar, high-dairy foods'],
      seeDoctor: 'See a dermatologist if acne is painful, cystic, scarring, or not improving after several weeks of over-the-counter care.',
    },
    'Actinic Keratosis': {
      symptoms: ['Rough, scaly patch', 'Sandpaper-like texture', 'Pink, red or brown colour', 'Often on sun-exposed skin', 'Itching or burning', 'May crust or bleed'],
      precautions: ['Apply broad-spectrum SPF 30+ sunscreen daily and reapply outdoors', 'Avoid peak midday sun and tanning beds entirely', 'Wear hats and protective clothing outdoors', 'Do not scratch or pick at the patch', 'Photograph the lesion to monitor any change in size or colour'],
      seeDoctor: 'Treat as pre-cancerous — book a dermatology review soon, especially if the patch grows, bleeds, or becomes tender.',
    },
    'Atopic Dermatitis': {
      symptoms: ['Intense itching', 'Dry, cracked skin', 'Red to brownish-grey patches', 'Small fluid bumps that may weep', 'Thickened skin from scratching', 'Flares in skin folds'],
      precautions: ['Moisturise within minutes of bathing to lock in hydration', 'Use lukewarm (not hot) water and fragrance-free cleansers', 'Identify and avoid triggers such as wool, dust, or stress', 'Keep nails short to limit damage from scratching', 'Use a humidifier in dry indoor air'],
      seeDoctor: 'See a dermatologist if flares are widespread, infected (oozing, crusting, fever), or disrupting sleep.',
    },
    'Basal Cell Carcinoma': {
      symptoms: ['Pearly or waxy bump', 'Flat, flesh-coloured or brown scar-like area', 'Sore that heals then returns', 'Visible tiny blood vessels', 'Bleeds or oozes easily', 'Slow-growing over months'],
      precautions: ['Do not delay — this is a skin cancer that needs medical removal', 'Protect the area and all skin with daily SPF 30+ sunscreen', 'Avoid further sun damage and tanning beds', 'Check the rest of your skin for similar lesions', 'Keep the area clean and avoid irritating it'],
      seeDoctor: 'Consult a dermatologist promptly. Basal cell carcinoma is highly treatable when caught early but should always be assessed by a doctor.',
    },
    'Benign Keratosis': {
      symptoms: ['Waxy, "stuck-on" appearance', 'Tan, brown or black colour', 'Well-defined round/oval shape', 'Slightly raised surface', 'Usually painless', 'May itch mildly'],
      precautions: ['Generally harmless — no treatment is medically required', 'Avoid scratching or picking the growth', 'Apply sunscreen to limit further darkening', 'Note any sudden change in colour, size or bleeding', 'Removal, if desired, is usually cosmetic only'],
      seeDoctor: 'See a dermatologist if the growth changes rapidly, bleeds, or you are unsure whether it is benign.',
    },
    'Eczema': {
      symptoms: ['Itchy, inflamed skin', 'Dry, scaly red patches', 'Cracked or rough skin', 'Small bumps that may leak fluid', 'Worse at night', 'Sensitive, raw areas from scratching'],
      precautions: ['Moisturise daily with a thick, fragrance-free emollient', 'Avoid harsh soaps, hot showers, and known irritants', 'Wear soft, breathable cotton fabrics', 'Manage stress, which can trigger flares', 'Keep skin cool and avoid sudden temperature changes'],
      seeDoctor: 'Consult a doctor if the rash is infected, spreading, or not responding to moisturisers and over-the-counter creams.',
    },
    'Melanocytic Nevus': {
      symptoms: ['Uniform brown or black colour', 'Round, symmetric shape', 'Smooth, even border', 'Usually smaller than 6 mm', 'Stable over time', 'Flat or slightly raised'],
      precautions: ['Apply the ABCDE rule monthly (Asymmetry, Border, Colour, Diameter, Evolving)', 'Photograph moles to track any changes', 'Protect skin from the sun with SPF 30+', 'Avoid tanning beds', 'Note any new itching, bleeding, or rapid growth'],
      seeDoctor: 'See a dermatologist if a mole changes shape, colour, or size, becomes itchy, or starts to bleed.',
    },
    'Melanoma': {
      symptoms: ['Asymmetric shape', 'Irregular or notched borders', 'Multiple or uneven colours', 'Diameter larger than 6 mm', 'Evolving size, shape or colour', 'Itching, bleeding or crusting'],
      precautions: ['Seek specialist evaluation urgently — do not wait', 'Avoid all sun exposure to the lesion and use SPF 50+', 'Do not attempt to remove or treat it yourself', 'Check the rest of your body for similar spots', 'Bring photos showing how the lesion has changed'],
      seeDoctor: 'Urgent: see a dermatologist as soon as possible. Early-detected melanoma is highly treatable, but delay can be dangerous.',
    },
    'Psoriasis': {
      symptoms: ['Thick red plaques', 'Silvery-white scales', 'Dry, cracked skin that may bleed', 'Itching or burning', 'Plaques on elbows, knees, scalp', 'Possible nail pitting'],
      precautions: ['Keep skin well moisturised to reduce scaling', 'Avoid triggers like stress, smoking, and alcohol', 'Get short, safe amounts of natural sunlight', 'Use gentle, fragrance-free skincare', 'Avoid scratching or picking plaques'],
      seeDoctor: 'See a dermatologist for a management plan, particularly if plaques are widespread or joints become painful or swollen.',
    },
    'Seborrheic Keratosis': {
      symptoms: ['Waxy, wart-like growth', 'Tan to dark brown colour', '"Pasted-on" look', 'Slightly raised, rough surface', 'Common with age', 'Usually painless'],
      precautions: ['Harmless and age-related — no treatment needed', 'Avoid rubbing or picking the growth', 'Apply sunscreen to surrounding skin', 'Watch for sudden changes or multiple new growths', 'Cosmetic removal is optional'],
      seeDoctor: 'See a doctor if a growth bleeds, becomes irritated, or you cannot tell it apart from a more serious lesion.',
    },
    'Tinea': {
      symptoms: ['Ring-shaped rash', 'Red, scaly raised edge', 'Clearer skin in the centre', 'Itching', 'Spreading over time', 'May affect skin, scalp or feet'],
      precautions: ['Keep the area clean and thoroughly dry', 'Avoid sharing towels, clothing, or combs', 'Wear loose, breathable fabrics', 'Wash hands after touching the rash to limit spread', 'Use a separate towel for affected areas'],
      seeDoctor: 'See a doctor for antifungal treatment if the rash spreads, affects the scalp/nails, or does not clear with OTC antifungals.',
    },
    'Urticaria': {
      symptoms: ['Raised, itchy welts (hives)', 'Welts that come and go', 'Red or skin-coloured bumps', 'Blanch when pressed', 'May merge into larger patches', 'Sometimes swelling of lips or eyes'],
      precautions: ['Identify and avoid triggers (foods, medication, heat)', 'Apply cool compresses to soothe itching', 'Wear loose, lightweight clothing', 'Avoid scratching and harsh soaps', 'Keep a diary of flares to spot patterns'],
      seeDoctor: 'Seek urgent care if hives come with swelling of the face/throat or trouble breathing. Otherwise see a doctor if they persist beyond 6 weeks.',
    },
    'Vitiligo': {
      symptoms: ['Smooth white patches of skin', 'Loss of pigment, often symmetric', 'Common on hands, face, around openings', 'Premature greying of nearby hair', 'Usually painless', 'May slowly spread'],
      precautions: ['Protect depigmented skin with SPF 50+ — it burns easily', 'Avoid skin trauma, which can trigger new patches', 'Consider cosmetic camouflage if desired', 'Support emotional wellbeing; the condition is not contagious', 'Avoid tanning, which increases contrast'],
      seeDoctor: 'See a dermatologist to discuss options such as topical therapy or phototherapy, and to rule out related conditions.',
    },
    'Warts': {
      symptoms: ['Small, rough, grainy growths', 'Flesh-coloured or grey', 'Tiny black dots (clotted vessels)', 'Rough to the touch', 'Often on hands or feet', 'May cluster'],
      precautions: ['Avoid touching, picking, or biting warts', 'Do not share towels, razors, or socks', 'Keep the area clean and dry', 'Cover the wart when swimming or in shared showers', 'Wash hands after contact to limit spread'],
      seeDoctor: 'See a doctor if warts are painful, spreading, on the face/genitals, or persist despite over-the-counter treatment.',
    },
    /* ---------- EYE ---------- */
    'Cataract': {
      symptoms: ['Cloudy or blurry vision', 'Faded or yellowed colours', 'Glare and halos around lights', 'Poor night vision', 'Frequent prescription changes', 'Double vision in one eye'],
      precautions: ['Wear UV-blocking sunglasses outdoors', 'Use brighter lighting for reading tasks', 'Avoid driving at night if glare is severe', 'Manage diabetes and blood pressure well', 'Attend regular eye check-ups'],
      seeDoctor: 'Schedule an ophthalmology consultation. Cataracts are treatable with surgery once they interfere with daily life.',
    },
    'Conjunctivitis': {
      symptoms: ['Red or pink eye', 'Watery or sticky discharge', 'Itching or gritty feeling', 'Crusting on the lids', 'Tearing', 'Mild light sensitivity'],
      precautions: ['Wash hands frequently and avoid touching the eyes', 'Do not share towels, pillows, or eye makeup', 'Discard contact lenses worn during infection', 'Use a clean, damp cloth to gently remove crusting', 'Stay home if it is the contagious (viral/bacterial) type'],
      seeDoctor: 'See a GP if there is significant pain, vision change, intense redness, or symptoms lasting more than a week.',
    },
    'Dry Eye': {
      symptoms: ['Stinging or burning eyes', 'Gritty, sandy sensation', 'Redness', 'Stringy mucus', 'Blurred vision that clears on blinking', 'Watery eyes (reflex tearing)'],
      precautions: ['Take regular screen breaks (20-20-20 rule)', 'Use a humidifier and avoid direct air drafts', 'Stay well hydrated', 'Use preservative-free artificial tears as needed', 'Limit prolonged contact lens wear'],
      seeDoctor: 'See an eye specialist if dryness is persistent, painful, or affecting vision despite lubricating drops.',
    },
    'Eyelid Drooping': {
      symptoms: ['Sagging upper eyelid', 'Reduced field of vision', 'Eye fatigue', 'Tilting the head back to see', 'Asymmetric eye appearance', 'Possible eye strain or aching'],
      precautions: ['Note when the drooping started and whether it is worsening', 'Avoid rubbing the eyes', 'Rest the eyes regularly', 'Track any associated weakness or double vision', 'Bring an old photo to show the change'],
      seeDoctor: 'Consult an ophthalmologist. Sudden drooping with headache, double vision, or weakness needs urgent assessment.',
    },
    'Uveitis': {
      symptoms: ['Eye pain', 'Marked light sensitivity', 'Blurred vision', 'Eye redness', 'Floaters', 'Decreased or hazy vision'],
      precautions: ['Seek prompt ophthalmology care — this can threaten vision', 'Wear sunglasses to ease light sensitivity', 'Avoid rubbing or straining the eye', 'Do not delay even if symptoms come and go', 'Report any history of autoimmune disease to your doctor'],
      seeDoctor: 'Urgent: see an ophthalmologist promptly. Untreated uveitis can lead to permanent vision loss.',
    },
    /* ---------- TEETH ---------- */
    'Calculus': {
      symptoms: ['Hard yellow or brown deposits', 'Rough feeling on teeth', 'Deposits near the gumline', 'Bad breath', 'Gum irritation', 'Bleeding when brushing'],
      precautions: ['Brush twice daily with fluoride toothpaste', 'Floss daily to remove plaque before it hardens', 'Use an antibacterial mouthwash', 'Reduce sugary and starchy snacks', 'Schedule regular professional cleanings'],
      seeDoctor: 'Book a dental cleaning — hardened tartar can only be removed professionally, not by brushing.',
    },
    'Caries': {
      symptoms: ['Toothache or spontaneous pain', 'Sensitivity to sweet, hot or cold', 'Visible holes or pits', 'Brown, black or white staining', 'Pain when biting', 'Bad breath'],
      precautions: ['Brush twice daily with fluoride toothpaste', 'Floss daily to clean between teeth', 'Cut down on sugary foods and drinks', 'Avoid frequent snacking', 'Drink fluoridated water where available'],
      seeDoctor: 'See a dentist soon — cavities only worsen and may need a filling. Severe or throbbing pain warrants prompt care.',
    },
    'Discoloration': {
      symptoms: ['Yellow or brown staining', 'Grey or dull tooth colour', 'Surface spots or streaks', 'Uneven shading', 'Usually painless', 'More visible on front teeth'],
      precautions: ['Limit coffee, tea, red wine, and tobacco', 'Brush after consuming staining foods or drinks', 'Use a straw for dark beverages', 'Maintain good daily oral hygiene', 'Avoid excessive whitening products without advice'],
      seeDoctor: 'Consult a dentist to confirm it is cosmetic and to discuss safe whitening options if the colour bothers you.',
    },
    'Gingivitis': {
      symptoms: ['Red, swollen gums', 'Bleeding when brushing or flossing', 'Tender gums', 'Bad breath', 'Receding gumline', 'Soft gum texture'],
      precautions: ['Brush twice daily along the gumline', 'Floss daily to remove plaque between teeth', 'Use an antibacterial mouthwash', 'Avoid tobacco', 'Eat a balanced diet low in sugar'],
      seeDoctor: 'See a dentist if bleeding persists despite good hygiene — untreated gingivitis can progress to periodontitis.',
    },
    'Hypodontia': {
      symptoms: ['One or more missing teeth', 'Gaps in the dental arch', 'Retained baby teeth', 'Spacing or alignment issues', 'Usually present from development', 'May affect bite'],
      precautions: ['Maintain excellent hygiene around existing teeth', 'Avoid habits that shift teeth into gaps', 'Keep regular dental reviews to monitor alignment', 'Discuss long-term options (bridge, implant, orthodontics)', 'Protect remaining teeth from excess load'],
      seeDoctor: 'Consult a dentist or orthodontist to plan management, especially if the gaps affect chewing, speech, or appearance.',
    },
    'Mouth Ulcer': {
      symptoms: ['Small round/oval sore', 'White, yellow or grey centre', 'Red inflamed border', 'Pain when eating or talking', 'Tingling before it appears', 'Usually inside cheeks or lips'],
      precautions: ['Avoid spicy, acidic, or rough foods while it heals', 'Use a soft-bristled toothbrush', 'Rinse with warm salt water', 'Manage stress and stay hydrated', 'Avoid toothpastes with sodium lauryl sulfate if prone to ulcers'],
      seeDoctor: 'See a GP or dentist if an ulcer lasts more than two weeks, is unusually large, or keeps recurring.',
    },
    /* ---------- UNIVERSAL ---------- */
    'Normal': {
      symptoms: ['No significant abnormality detected', 'Healthy appearance', 'No obvious lesion or inflammation'],
      precautions: ['Maintain your usual hygiene and self-care routine', 'Continue routine check-ups appropriate for your age', 'Protect skin and eyes from excess sun exposure', 'Monitor for any new or changing symptoms', 'Maintain a balanced diet and good general health'],
      seeDoctor: 'No findings here, but always see a professional if you notice new, persistent, or worsening symptoms.',
    },
  };

  function infoFor(disease) {
    return CONDITION_INFO[disease] || {
      symptoms: ['Refer to a clinician for a detailed symptom assessment.'],
      precautions: ['Maintain good general hygiene and self-care.', 'Monitor the area for any changes.', 'Seek professional advice for a clear diagnosis.'],
      seeDoctor: 'Consult a qualified healthcare professional for evaluation.',
    };
  }

  const DOMAIN_LABELS = { skin: 'Skin', eye: 'Eye', teeth: 'Dental' };

  /* Quick-add symptom chips for the upload screen */
  const QUICK_SYMPTOMS = [
    'itchy', 'red patch', 'painful', 'swelling', 'bleeding', 'dry skin',
    'discolouration', 'growing spot', 'blurred vision', 'light sensitivity',
    'toothache', 'bad breath',
  ];

  /* -------------------------------------------------
   * State + DOM cache
   * ------------------------------------------------- */
  const state = { file: null, symptoms: '', lastResponse: null, originalDataUrl: null };

  const el = {};
  function cacheDom() {
    [
      'disclaimer-modal', 'ack-btn',
      'begin-btn', 'proceed-btn', 'back-to-landing',
      'dropzone', 'file-input', 'preview-card', 'preview-thumb',
      'preview-name', 'preview-size', 'symptoms-input', 'analyze-btn',
      'screen-home', 'screen-how', 'screen-about', 'screen-upload', 'screen-results',
      'pill-domain', 'pill-confidence', 'low-conf-alert',
      'condition-name', 'condition-sub',
      'gauge', 'gauge-meter', 'gauge-pct',
      'bar-chart', 'gradcam-img', 'original-img',
      'symptom-info-list', 'symptom-info-note', 'precaution-list', 'doctor-callout', 'doctor-text',
      'symptom-panel', 'symptom-list',
      'severity-banner', 'severity-label', 'severity-text',
      'plain-explanation', 'reset-btn', 'download-btn',
      'toast', 'spinner-overlay', 'pipe-steps',
      'nav-toggle', 'nav-links', 'theme-toggle', 'symptom-chips',
    ].forEach(id => el[id] = document.getElementById(id));
  }

  /* -------------------------------------------------
   * Theme
   * ------------------------------------------------- */
  function initTheme() {
    let theme = null;
    try { theme = localStorage.getItem('medivision_theme'); } catch (_) {}
    if (!theme) {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    if (el['theme-toggle']) {
      el['theme-toggle'].addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('medivision_theme', next); } catch (_) {}
      });
    }
  }

  /* -------------------------------------------------
   * Disclaimer modal
   * ------------------------------------------------- */
  function initDisclaimer() {
    const modal = el['disclaimer-modal'];
    let acked = false;
    try { acked = sessionStorage.getItem('medivision_ack') === 'true'; } catch (_) {}
    if (acked) {
      modal.classList.add('hidden');
    } else {
      setTimeout(() => el['ack-btn'].focus(), 50);
      modal.addEventListener('keydown', (e) => {
        if (modal.classList.contains('hidden')) return;
        if (e.key === 'Tab') { e.preventDefault(); el['ack-btn'].focus(); }
      });
    }
    el['ack-btn'].addEventListener('click', () => {
      try { sessionStorage.setItem('medivision_ack', 'true'); } catch (_) {}
      // Persist consent for the API's server-side consent gate.
      try { localStorage.setItem('mv_consent', 'true'); } catch (_) {}
      modal.classList.add('hidden');
    });
  }

  /* -------------------------------------------------
   * Animated stat counters (landing)
   * ------------------------------------------------- */
  function animateCounters() {
    document.querySelectorAll('.stat-num[data-count]').forEach(node => {
      const target = parseInt(node.getAttribute('data-count'), 10) || 0;
      const suffix = node.getAttribute('data-suffix') || '';
      const dur = 1100;
      const start = performance.now();
      function tick(now) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /* -------------------------------------------------
   * State machine
   * ------------------------------------------------- */
  function setState(stateId) {
    let active = null;
    Object.values(STATES).forEach(id => {
      const node = document.getElementById(id);
      if (node) {
        const on = id === stateId;
        node.classList.toggle('active', on);
        if (on) active = node;
      }
    });
    const activeKey = Object.keys(SCREEN_BY_KEY).find(k => SCREEN_BY_KEY[k] === stateId);
    document.querySelectorAll('.nav-link').forEach(a => {
      const on = a.dataset.screen === activeKey;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (el['nav-links']) el['nav-links'].classList.remove('open');
    if (el['nav-toggle']) el['nav-toggle'].setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Move focus to the new page's heading for screen-reader / keyboard users.
    if (active) {
      const heading = active.querySelector('h1, h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
  }

  /* -------------------------------------------------
   * Toast
   * ------------------------------------------------- */
  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3500);
  }

  /* -------------------------------------------------
   * File handling
   * ------------------------------------------------- */
  function fileLooksValid(file) {
    if (!file) return false;
    const mimeOk = ALLOWED_MIME.includes(file.type);
    const extOk = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!mimeOk && !extOk) { toast('Unsupported file type. Use JPG, PNG, or WEBP.'); return false; }
    if (file.size > MAX_BYTES) { toast(`File too large (${(file.size / 1048576).toFixed(1)} MB). Max is 10 MB.`); return false; }
    if (file.size === 0) { toast('Selected file is empty.'); return false; }
    return true;
  }

  function setSelectedFile(file) {
    if (!fileLooksValid(file)) return;
    state.file = file;
    const reader = new FileReader();
    reader.onload = e => {
      el['preview-thumb'].src = e.target.result;
      state.originalDataUrl = e.target.result;
    };
    reader.readAsDataURL(file);
    el['preview-name'].textContent = file.name;
    el['preview-size'].textContent = formatBytes(file.size);
    el['preview-card'].classList.remove('hidden');
    el['analyze-btn'].disabled = false;
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  function initUpload() {
    const dz = el.dropzone;
    const input = el['file-input'];
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) setSelectedFile(f);
    });
    ['dragenter', 'dragover'].forEach(evt => {
      dz.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dz.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover'); });
    });
    dz.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setSelectedFile(f);
    });
  }

  /* Quick-add symptom chips */
  function initSymptomChips() {
    const wrap = el['symptom-chips'];
    if (!wrap) return;
    QUICK_SYMPTOMS.forEach(sym => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'symptom-chip';
      b.textContent = sym;
      b.addEventListener('click', () => toggleSymptomChip(b, sym));
      wrap.appendChild(b);
    });
  }
  function toggleSymptomChip(btn, sym) {
    const ta = el['symptoms-input'];
    const parts = ta.value.split(',').map(s => s.trim()).filter(Boolean);
    const idx = parts.findIndex(p => p.toLowerCase() === sym.toLowerCase());
    if (idx >= 0) { parts.splice(idx, 1); btn.classList.remove('added'); }
    else { parts.push(sym); btn.classList.add('added'); }
    ta.value = parts.join(', ');
  }

  /* -------------------------------------------------
   * Live inference pipeline animation
   * ------------------------------------------------- */
  let pipeTimers = [];
  function pipeStepNodes() {
    return el['pipe-steps'] ? Array.from(el['pipe-steps'].querySelectorAll('.pipe-step')) : [];
  }
  function startPipeline() {
    const steps = pipeStepNodes();
    pipeTimers.forEach(clearTimeout);
    pipeTimers = [];
    steps.forEach(s => s.classList.remove('active', 'done'));
    if (!steps.length) return;
    const advance = (i) => {
      if (i > 0) { steps[i - 1].classList.remove('active'); steps[i - 1].classList.add('done'); }
      if (i < steps.length) steps[i].classList.add('active');
    };
    advance(0);
    [700, 1500, 2600].forEach((ms, idx) => { pipeTimers.push(setTimeout(() => advance(idx + 1), ms)); });
  }
  function finishPipeline() {
    pipeTimers.forEach(clearTimeout);
    pipeTimers = [];
    pipeStepNodes().forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
  }

  /* -------------------------------------------------
   * API call
   * ------------------------------------------------- */
  async function analyzeImage() {
    if (!state.file) { toast('Please select an image first.'); return; }
    state.symptoms = el['symptoms-input'].value.trim();
    const fd = new FormData();
    fd.append('image', state.file);
    if (state.symptoms) fd.append('symptoms', state.symptoms);
    // Server-side consent gate: accepted via the disclaimer modal.
    let consented = false;
    try { consented = localStorage.getItem('mv_consent') === 'true'; } catch (_) {}
    if (consented) fd.append('consent', 'true');
    el['spinner-overlay'].classList.remove('hidden');
    startPipeline();
    try {
      // ngrok-skip-browser-warning bypasses ngrok's free-tier interstitial
      // page for fetch/XHR calls when this is tunneled with ngrok; ignored
      // by any other host.
      const headers = { 'ngrok-skip-browser-warning': 'true' };
      // Attach the login token (if signed in) so this analysis is saved
      // to the user's history. Anonymous analysis still works.
      const token = (window.MVAuth && window.MVAuth.getToken()) || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        body: fd,
        headers,
      });
      if (!res.ok) {
        let msg = `Server returned ${res.status}`;
        let code = '';
        try {
          const errBody = await res.json();
          if (errBody && errBody.error) msg = errBody.error;
          if (errBody && errBody.code) code = errBody.code;
        } catch (_) {}
        if (code === 'CONSENT_REQUIRED') {
          // Re-show the disclaimer so the user can accept it.
          try { sessionStorage.removeItem('medivision_ack'); } catch (_) {}
          if (el['disclaimer-modal']) el['disclaimer-modal'].classList.remove('hidden');
          toast('Please accept the medical disclaimer first.');
        } else if (code === 'OUT_OF_DISTRIBUTION') {
          toast(msg);
        } else if (res.status === 429) {
          toast('Too many requests — please wait a minute and try again.');
        } else if (res.status === 401 && window.MVAuth) {
          window.MVAuth.logout();
          toast('Your session expired. Analysis continues anonymously — sign in again to save history.');
        } else {
          toast(msg);
        }
        return;
      }
      const data = await res.json();
      state.lastResponse = data;
      renderResults(data);
      setState(STATES.RESULTS);
    } catch (err) {
      console.error(err);
      toast('Network error: could not reach the API. Is the Flask server running?');
    } finally {
      finishPipeline();
      el['spinner-overlay'].classList.add('hidden');
    }
  }

  /* -------------------------------------------------
   * Results rendering
   * ------------------------------------------------- */
  function renderResults(data) {
    const domainLabel = DOMAIN_LABELS[data.domain] || capitalize(data.domain);
    el['pill-domain'].textContent = `${domainLabel} Domain`;

    const confPct = (data.top_confidence * 100);
    const confStr = confPct.toFixed(1);
    if (data.low_confidence) {
      el['pill-confidence'].className = 'pill pill-red';
      el['pill-confidence'].textContent = 'Low Confidence';
      el['low-conf-alert'].classList.remove('hidden');
    } else {
      el['pill-confidence'].className = 'pill pill-blue';
      el['pill-confidence'].textContent = `${confStr}% Confidence`;
      el['low-conf-alert'].classList.add('hidden');
    }

    // Diagnosis hero
    el['condition-name'].textContent = data.top_disease;
    el['condition-sub'].textContent = DISEASE_DESCRIPTIONS[data.top_disease]
      || 'Predicted condition from the screening model.';

    // Confidence gauge (animate after a tick so the transition runs).
    // Colour is set in the severity block below, once the tier is known.
    el['gauge'].className = 'gauge';
    el['gauge-meter'].style.strokeDashoffset = GAUGE_CIRC;
    animateGauge(confPct);

    // Bar chart
    renderBars(data.all_predictions);

    // Original image
    if (state.originalDataUrl && el['original-img']) {
      el['original-img'].src = state.originalDataUrl;
      el['original-img'].closest('.cam-fig').style.display = '';
    } else if (el['original-img']) {
      el['original-img'].removeAttribute('src');
      el['original-img'].closest('.cam-fig').style.display = 'none';
    }

    // Grad-CAM
    if (data.gradcam_image) {
      el['gradcam-img'].src = `data:image/png;base64,${data.gradcam_image}`;
      el['gradcam-img'].style.display = '';
    } else {
      el['gradcam-img'].removeAttribute('src');
      el['gradcam-img'].style.display = 'none';
    }

    // Symptoms + precautions knowledge base
    renderConditionInfo(data.top_disease, state.symptoms);

    // Server-side symptom refinement panel
    if (data.symptoms_used && data.symptom_matches && Object.keys(data.symptom_matches).length) {
      el['symptom-panel'].classList.remove('hidden');
      el['symptom-list'].innerHTML = '';
      Object.entries(data.symptom_matches).forEach(([disease, matches]) => {
        const phrases = Array.isArray(matches) ? matches : [];
        const row = document.createElement('div');
        row.className = 'symptom-item';
        row.innerHTML = phrases.length
          ? `<strong>${escapeHtml(disease)}</strong>: matched &mdash; ${phrases.map(p => `&ldquo;${escapeHtml(p)}&rdquo;`).join(', ')}`
          : `<strong>${escapeHtml(disease)}</strong>: matched`;
        el['symptom-list'].appendChild(row);
      });
    } else {
      el['symptom-panel'].classList.add('hidden');
    }

    // Severity
    const sev = (data.severity || 'MILD').toUpperCase();
    el['severity-banner'].className = 'severity-banner ' + sev.toLowerCase();
    el['severity-label'].textContent = sev;
    el['severity-text'].textContent = data.recommendation || '';

    // Colour the confidence gauge by triage tier (red / amber / teal-green),
    // overridden to red when confidence is low.
    el['gauge'].className = 'gauge sev-' + sev.toLowerCase() + (data.low_confidence ? ' low' : '');

    // Explanation
    el['plain-explanation'].textContent = buildExplanation(data);
  }

  function animateGauge(pct) {
    const clamped = Math.max(0, Math.min(pct, 100));
    const offset = GAUGE_CIRC * (1 - clamped / 100);
    // force a reflow so the transition fires from the reset value
    void el['gauge-meter'].getBoundingClientRect();
    requestAnimationFrame(() => { el['gauge-meter'].style.strokeDashoffset = offset; });
    // count the number up
    const dur = 1100, start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el['gauge-pct'].textContent = (clamped * eased).toFixed(0) + '%';
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderConditionInfo(disease, userSymptoms) {
    const info = infoFor(disease);
    const userTokens = tokenize(userSymptoms);

    // Symptoms as chips, highlight ones overlapping with what the user typed
    const list = el['symptom-info-list'];
    list.innerHTML = '';
    info.symptoms.forEach(sym => {
      const chip = document.createElement('span');
      chip.className = 's-chip';
      if (userTokens.size && tokensOverlap(sym, userTokens)) chip.classList.add('matched');
      chip.innerHTML = `<span class="pulse"></span>${escapeHtml(sym)}`;
      list.appendChild(chip);
    });
    el['symptom-info-note'].style.display = userTokens.size ? '' : 'none';

    // Precautions
    const ul = el['precaution-list'];
    ul.innerHTML = '';
    info.precautions.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="tick" aria-hidden="true">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ` +
        `stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>` +
        `</span><span>${escapeHtml(p)}</span>`;
      ul.appendChild(li);
    });

    // When to see a doctor
    el['doctor-text'].textContent = info.seeDoctor;
  }

  function tokenize(s) {
    const stop = new Set(['the','and','a','an','of','to','with','no','not','my','is','are','for','on','in','it','that','this','i','have','has']);
    const set = new Set();
    String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).forEach(w => {
      if (w.length > 2 && !stop.has(w)) set.add(w);
    });
    return set;
  }
  function tokensOverlap(symptomText, userTokens) {
    const symTokens = tokenize(symptomText);
    for (const t of symTokens) {
      if (userTokens.has(t)) return true;
      for (const u of userTokens) {
        if ((t.length > 3 && u.includes(t)) || (u.length > 3 && t.includes(u))) return true;
      }
    }
    return false;
  }

  function renderBars(predictions) {
    const root = el['bar-chart'];
    root.innerHTML = '';
    if (!predictions || !predictions.length) return;
    const top = predictions[0];
    predictions.forEach((p, i) => {
      const pct = (p.probability * 100);
      const cls = i === 0 && p.label === top.label ? 'top'
        : (URGENT_DISEASES.has(p.label) ? 'urgent' : 'other');
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <div class="bar-label">${escapeHtml(p.label)}</div>
        <div class="bar-track"><div class="bar-fill ${cls}"></div></div>
        <div class="bar-pct">${pct.toFixed(0)}%</div>`;
      root.appendChild(row);
      // animate width on next frame
      const fill = row.querySelector('.bar-fill');
      requestAnimationFrame(() => { fill.style.width = `${Math.min(pct, 100)}%`; });
    });
  }

  function buildExplanation(d) {
    const domain = (DOMAIN_LABELS[d.domain] || d.domain).toLowerCase();
    const conf = (d.top_confidence * 100).toFixed(1);
    const lay = DISEASE_DESCRIPTIONS[d.top_disease] || '';
    const sev = (d.severity || '').toUpperCase();
    let conf_qual;
    if (d.low_confidence) conf_qual = 'low';
    else if (d.top_confidence >= 0.8) conf_qual = 'high';
    else conf_qual = 'moderate';
    let s1 = `The model identified features consistent with ${d.top_disease} in this ${domain} image, with ${conf_qual} confidence (${conf}%).`;
    let s2 = lay ? ` ${lay}` : '';
    let s3;
    if (sev === 'URGENT') s3 = ' This result is flagged as urgent, so prompt evaluation by a specialist is recommended.';
    else if (sev === 'MODERATE') s3 = ' A follow-up consultation is recommended to confirm and plan next steps.';
    else if (sev === 'NORMAL') s3 = ' No significant abnormality was detected, but clinical confirmation is still recommended.';
    else s3 = ' Clinical confirmation is recommended before drawing any conclusions.';
    return s1 + s2 + s3;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  /* -------------------------------------------------
   * Reset / download
   * ------------------------------------------------- */
  function resetForNewImage() {
    state.file = null;
    state.symptoms = '';
    state.lastResponse = null;
    state.originalDataUrl = null;
    el['file-input'].value = '';
    el['preview-card'].classList.add('hidden');
    el['preview-thumb'].removeAttribute('src');
    el['symptoms-input'].value = '';
    el['analyze-btn'].disabled = true;
    document.querySelectorAll('.symptom-chip.added').forEach(c => c.classList.remove('added'));
    setState(STATES.UPLOAD);
  }

  function downloadReport() {
    const data = state.lastResponse;
    const ns = window.jspdf;
    if (!data || !ns || !ns.jsPDF) { window.print(); return; }
    try { buildPdf(ns.jsPDF, data); }
    catch (err) { console.error('PDF generation failed, falling back to print:', err); window.print(); }
  }

  function toPng(imgEl) {
    const c = document.createElement('canvas');
    c.width = imgEl.naturalWidth; c.height = imgEl.naturalHeight;
    c.getContext('2d').drawImage(imgEl, 0, 0);
    return c.toDataURL('image/png');
  }
  function fitDims(imgEl, maxW, maxH) {
    const nw = imgEl.naturalWidth || maxW, nh = imgEl.naturalHeight || maxH;
    const r = Math.min(maxW / nw, maxH / nh);
    return { w: nw * r, h: nh * r };
  }

  function buildPdf(JsPDF, data) {
    const doc = new JsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const teal = [20, 128, 142];
    let y = margin;

    function ensure(space) {
      if (y + space > pageH - 60) { doc.addPage(); y = margin; }
    }

    doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...teal);
    doc.text('MediVision Screening Report', margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString()}  |  Educational use only`, margin, y);
    y += 8;
    doc.setDrawColor(...teal).setLineWidth(1.2).line(margin, y, pageW - margin, y);
    y += 22;

    const domainLabel = DOMAIN_LABELS[data.domain] || capitalize(data.domain);
    const confPct = (data.top_confidence * 100).toFixed(1);
    const facts = [
      ['Domain', domainLabel],
      ['Predicted condition', String(data.top_disease)],
      ['Confidence', `${confPct}%${data.low_confidence ? '  (low confidence)' : ''}`],
      ['Severity', String(data.severity || '').toUpperCase()],
      ['Recommendation', String(data.recommendation || '')],
    ];
    doc.setFontSize(11);
    facts.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold').setTextColor(...teal);
      doc.text(`${k}:`, margin, y);
      doc.setFont('helvetica', 'normal').setTextColor(40);
      const lines = doc.splitTextToSize(v, pageW - margin * 2 - 130);
      doc.text(lines, margin + 130, y);
      y += 18 * lines.length;
    });
    y += 8;

    // Images
    const colW = (pageW - margin * 2 - 16) / 2;
    const imgMaxH = 150;
    const orig = el['original-img'], cam = el['gradcam-img'];
    let rowH = 0;
    if (state.originalDataUrl && orig && orig.naturalWidth) {
      const d = fitDims(orig, colW, imgMaxH);
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(120);
      doc.text('Original', margin, y);
      doc.addImage(toPng(orig), 'PNG', margin, y + 6, d.w, d.h);
      rowH = Math.max(rowH, d.h);
    }
    if (cam && cam.getAttribute('src') && cam.naturalWidth) {
      const d = fitDims(cam, colW, imgMaxH);
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(120);
      doc.text('Grad-CAM', margin + colW + 16, y);
      doc.addImage(toPng(cam), 'PNG', margin + colW + 16, y + 6, d.w, d.h);
      rowH = Math.max(rowH, d.h);
    }
    if (rowH) y += rowH + 28;

    // Predictions
    ensure(60);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...teal);
    doc.text('Top Predictions', margin, y);
    y += 16;
    doc.setFontSize(10);
    (data.all_predictions || []).slice(0, 6).forEach(p => {
      doc.setFont('helvetica', 'normal').setTextColor(40);
      doc.text(String(p.label), margin, y);
      const barX = margin + 170, barW = pageW - margin - barX - 40;
      doc.setFillColor(226, 232, 240).rect(barX, y - 7, barW, 8, 'F');
      doc.setFillColor(...teal).rect(barX, y - 7, barW * Math.min(p.probability, 1), 8, 'F');
      doc.text(`${(p.probability * 100).toFixed(0)}%`, pageW - margin - 28, y);
      y += 18;
    });
    y += 12;

    // Symptoms + precautions from the knowledge base
    const info = infoFor(data.top_disease);
    ensure(80);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...teal);
    doc.text('Common Symptoms', margin, y); y += 15;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(40);
    info.symptoms.forEach(s => {
      ensure(16);
      const lines = doc.splitTextToSize(`•  ${s}`, pageW - margin * 2);
      doc.text(lines, margin, y); y += 14 * lines.length;
    });
    y += 8;

    ensure(80);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...teal);
    doc.text('Recommended Precautions', margin, y); y += 15;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(40);
    info.precautions.forEach(p => {
      ensure(16);
      const lines = doc.splitTextToSize(`•  ${p}`, pageW - margin * 2);
      doc.text(lines, margin, y); y += 14 * lines.length;
    });
    y += 8;

    ensure(60);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...teal);
    doc.text('When to See a Doctor', margin, y); y += 15;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(40);
    let dl = doc.splitTextToSize(info.seeDoctor, pageW - margin * 2);
    doc.text(dl, margin, y); y += 14 * dl.length + 8;

    // Explanation
    ensure(60);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...teal);
    doc.text('Explanation', margin, y); y += 16;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(40);
    doc.text(doc.splitTextToSize(buildExplanation(data), pageW - margin * 2), margin, y);

    // Footer disclaimer
    const fy = pageH - 48;
    doc.setDrawColor(200).setLineWidth(0.6).line(margin, fy, pageW - margin, fy);
    doc.setFontSize(8).setTextColor(120);
    doc.text(doc.splitTextToSize(
      'MediVision is an educational screening tool only. Results do not constitute medical ' +
      'advice or diagnosis. Always consult a qualified healthcare professional.',
      pageW - margin * 2), margin, fy + 13);

    const safe = String(data.top_disease).replace(/[^a-z0-9]+/gi, '_');
    doc.save(`MediVision_Report_${safe}.pdf`);
  }

  /* -------------------------------------------------
   * Live model metrics — single source of truth is
   * api/model_metrics.json (served at /api/model-info).
   * The hardcoded numbers on the How It Works page are
   * only replaced when real values exist in that file.
   * ------------------------------------------------- */
  function loadModelMetrics() {
    const nodes = document.querySelectorAll('.metric-stat');
    if (!nodes.length) return;
    fetch(`${API_BASE}/api/model-info`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => (r.ok ? r.json() : null))
      .then(info => {
        if (!info || !info.models) return;
        const order = ['domain', 'skin', 'eye', 'teeth'];
        nodes.forEach((node, i) => {
          const m = info.models[order[i]];
          if (!m || !m.metrics) return;
          const acc = (m.metrics.accuracy != null) ? m.metrics.accuracy
            : (m.metrics.top1_accuracy != null ? m.metrics.top1_accuracy : null);
          const val = node.querySelector('[data-metric]');
          if (acc != null && val) {
            val.textContent = (acc <= 1 ? acc * 100 : acc).toFixed(1) + '%';
          }
        });
      })
      .catch(() => {});
  }

  /* -------------------------------------------------
   * Wire-up
   * ------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    cacheDom();
    initTheme();
    initDisclaimer();
    initUpload();
    initSymptomChips();
    animateCounters();
    loadModelMetrics();

    el['begin-btn'].addEventListener('click', () => setState(STATES.UPLOAD));
    el['proceed-btn'].addEventListener('click', () => setState(STATES.UPLOAD));
    el['back-to-landing'].addEventListener('click', () => setState(STATES.HOME));
    el['reset-btn'].addEventListener('click', resetForNewImage);
    el['download-btn'].addEventListener('click', downloadReport);
    el['analyze-btn'].addEventListener('click', analyzeImage);

    if (el['nav-toggle'] && el['nav-links']) {
      el['nav-toggle'].addEventListener('click', () => {
        const open = el['nav-links'].classList.toggle('open');
        el['nav-toggle'].setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    // Any element with data-screen routes to that page (nav links, brand,
    // domain cards, footer links, in-page CTAs).
    document.querySelectorAll('[data-screen]').forEach(node => {
      node.addEventListener('click', (e) => {
        e.preventDefault();
        const target = SCREEN_BY_KEY[node.getAttribute('data-screen')];
        if (target) setState(target);
      });
    });

    // Demo mode: open index.html#demo to preview the results screen with no backend.
    if (location.hash === '#demo') runDemo();
  });

  /* -------------------------------------------------
   * Demo mode — render a sample result without the API.
   * ------------------------------------------------- */
  function runDemo() {
    try { sessionStorage.setItem('medivision_ack', 'true'); } catch (_) {}
    if (el['disclaimer-modal']) el['disclaimer-modal'].classList.add('hidden');
    state.symptoms = 'dark spot, irregular border, changing mole';
    state.lastResponse = {
      domain: 'skin',
      domain_confidence: 0.93,
      top_disease: 'Melanoma',
      top_confidence: 0.87,
      all_predictions: [
        { label: 'Melanoma', probability: 0.87 },
        { label: 'Melanocytic Nevus', probability: 0.06 },
        { label: 'Basal Cell Carcinoma', probability: 0.03 },
        { label: 'Benign Keratosis', probability: 0.02 },
        { label: 'Seborrheic Keratosis', probability: 0.015 },
        { label: 'Eczema', probability: 0.005 },
      ],
      symptoms_used: true,
      symptom_matches: { 'Melanoma': ['dark spot', 'irregular border', 'changing mole'] },
      gradcam_image: null,
      low_confidence: false,
      severity: 'URGENT',
      recommendation: 'Consult a dermatologist immediately.',
    };
    renderResults(state.lastResponse);
    setState(STATES.RESULTS);
  }
})();
