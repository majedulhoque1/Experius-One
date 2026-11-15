/* Business Review form.
   Validates here, then POSTs to the submit_review_request RPC (supabase/migrations/0001_site_admin.sql),
   which runs the same checks again and is the only way into the database.
   States covered: validation error (inline + summary), submitting, submission failed, success.

   Experiment (branch experiment/one-question-review): the form is shown one question per screen.
   The markup is still one plain form; this script adds .is-stepper and shows one .q-step at a time.
   If anything here fails before the stepper starts, the visitor gets the full single-page form. */
(function () {
  'use strict';
  var form = document.getElementById('review-form');
  if (!form) return;

  var summary = document.getElementById('error-summary');
  var summaryList = summary.querySelector('ul');
  var failAlert = document.getElementById('submit-failed');
  var submitBtn = form.querySelector('[type="submit"]');
  var status = document.getElementById('form-status');
  var submitting = false;
  var openedAt = Date.now();
  var started = false;
  var STORE_KEY = 'experius-review-draft';

  function track(event, label) { if (window.experiusTrack) window.experiusTrack(event, label); }
  // form_start fires once, on the first thing the visitor types or ticks. No values are sent.
  function markStarted() { if (!started) { started = true; track('form_start'); } }
  form.addEventListener('input', markStarted);

  function store() { try { return window.sessionStorage; } catch (e) { return null; } }

  // ---- Restore a draft from this browser session (refresh, or leaving and coming back). ----
  // Consent and the honeypot are never stored: consent is asked fresh each time.
  var SAVED_FIELDS = ['improve', 'businessType', 'context', 'business', 'website', 'name', 'email', 'contactMethod', 'phone', 'source'];
  function saveDraft() {
    var ss = store(); if (!ss) return;
    var data = {};
    SAVED_FIELDS.forEach(function (name) {
      if (name === 'improve') data.improve = checkedValues('improve');
      else data[name] = form.elements[name].value;
    });
    data.step = stepper.on ? stepper.steps[stepper.index].getAttribute('data-step') : null;
    try { ss.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* full or blocked: fine */ }
  }
  function loadDraft() {
    var ss = store(); if (!ss) return null;
    try { return JSON.parse(ss.getItem(STORE_KEY)); } catch (e) { return null; }
  }
  function checkedValues(name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (b) { return b.value; });
  }

  var draft = loadDraft();
  if (draft) {
    SAVED_FIELDS.forEach(function (name) {
      if (draft[name] == null) return;
      if (name === 'improve') {
        (draft.improve || []).forEach(function (v) {
          var box = form.querySelector('input[name="improve"][value="' + String(v).replace(/[^a-z]/g, '') + '"]');
          if (box) box.checked = true;
        });
      } else {
        form.elements[name].value = draft[name]; // RadioNodeList.value checks the matching radio
      }
    });
  }

  // Arriving from an audience page (?type=solar etc.) pre-selects the business type, so the visitor
  // doesn't have to repeat what the site already knows. The value is a category, never personal data.
  var TYPES = {
    expertise: 'Coach, consultant or independent expert',
    special: 'Special education or therapy centre',
    clinic: 'Clinic or wellness practice',
    education: 'Training academy or educator',
    solar: 'Solar or battery installation',
    agency: 'Agency looking for an implementation partner'
  };
  var params = new URLSearchParams(window.location.search);
  var typeParam = params.get('type');
  // hasOwnProperty, so ?type=constructor can't reach Object.prototype and blank the choice.
  var typeFromLink = !!(typeParam && Object.prototype.hasOwnProperty.call(TYPES, typeParam));
  if (typeFromLink) form.elements.businessType.value = TYPES[typeParam];

  // Arriving from the homepage self-check (?improve=leads,booking) ticks the areas the visitor already chose.
  params.getAll('improve').join(',').split(',').forEach(function (v) {
    var box = form.querySelector('input[name="improve"][value="' + v.replace(/[^a-z]/g, '') + '"]');
    if (box && v) box.checked = true;
  });

  // Country is no longer asked; the browser's time zone (e.g. "Asia/Dhaka") is enough to suggest meeting times.
  try { form.elements.country.value = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 80); } catch (e) { /* old browser */ }

  // The phone field appears only when the visitor picks WhatsApp or a phone call.
  var contactGroup = document.getElementById('contact-method');
  var phoneField = document.getElementById('phone-field');
  function syncPhone() {
    var show = /WhatsApp|Phone/.test(form.elements.contactMethod.value);
    phoneField.hidden = !show;
    if (!show) { form.elements.phone.value = ''; setError('phone', ''); }
  }

  // Each rule returns an error message, or '' when the field is fine. Messages say how to fix it.
  var rules = {
    improve: function () { return checkedValues('improve').length ? '' : 'Choose at least one area, or "Not sure yet"'; },
    businessType: function (f) { return f.value ? '' : 'Choose what best describes your business'; },
    context: function (f) {
      var v = f.value.trim();
      if (!v) return 'Tell us briefly what is happening';
      return v.length < 10 ? 'Add a few more words, a sentence is enough' : '';
    },
    business: function (f) { return f.value.trim() ? '' : 'Enter your business or organization name'; },
    name: function (f) { return f.value.trim() ? '' : 'Enter your name'; },
    email: function (f) {
      if (!f.value.trim()) return 'Enter your email';
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim()) ? '' : 'Enter an email address like name@business.com';
    },
    phone: function (f) {
      var v = f.value.replace(/[^0-9]/g, '');
      if (!f.value.trim()) return '';
      return v.length >= 7 ? '' : 'Enter a number with its country code, like +61 400 000 000';
    },
    consent: function (f) { return f.checked ? '' : 'Confirm we can use these details to reply to you'; }
  };

  function fieldWrap(name) { return form.querySelector('[data-field="' + name + '"]'); }

  function setError(name, message) {
    var wrap = fieldWrap(name);
    var control = form.elements[name];
    var errorEl = wrap.querySelector('.field-error span');
    wrap.classList.toggle('has-error', !!message);
    errorEl.textContent = message;
    var targets = control && control.length && !control.tagName ? Array.prototype.slice.call(control) : [control];
    targets.forEach(function (el) {
      if (!el) return;
      if (message) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    });
  }

  function validate(name) {
    var message = rules[name](form.elements[name]);
    setError(name, message);
    if (!summary.hidden) refreshSummary();
    return message;
  }

  // Keep the error summary honest: a fixed field drops out of it straight away.
  function refreshSummary() {
    var open = Array.prototype.filter.call(summaryList.querySelectorAll('li'), function (li) {
      var wrap = fieldWrap(li.getAttribute('data-name'));
      if (!wrap.classList.contains('has-error')) { li.remove(); return false; }
      return true;
    });
    if (!open.length) summary.hidden = true;
    else summary.querySelector('h3 span').textContent = open.length === 1 ? 'There is 1 thing to fix' : 'There are ' + open.length + ' things to fix';
  }

  contactGroup.addEventListener('change', syncPhone);
  syncPhone();

  // Validate a field when the visitor leaves it, then live once it has shown an error. Never while first typing.
  Object.keys(rules).forEach(function (name) {
    var wrap = fieldWrap(name);
    wrap.addEventListener('focusout', function (e) {
      if (wrap.contains(e.relatedTarget)) return;
      if (name === 'improve' || name === 'consent' || name === 'businessType') return; // group-level: checked on Continue / Send
      var control = form.elements[name];
      if (control.value && control.value.trim && control.value.trim()) validate(name);
    });
    wrap.addEventListener('input', function () { if (wrap.classList.contains('has-error')) validate(name); });
    wrap.addEventListener('change', function () { if (wrap.classList.contains('has-error')) validate(name); });
  });

  // ---- Starter sentences for question 3: a tap fills (or adds to) the box. ----
  var starters = form.querySelector('[data-q-starters]');
  var contextBox = form.elements.context;
  if (starters) {
    starters.hidden = false;
    starters.addEventListener('click', function (e) {
      var btn = e.target.closest('.q-starter');
      if (!btn) return;
      var line = btn.textContent.trim();
      var now = contextBox.value.trim();
      if (now.indexOf(line) === -1) contextBox.value = now ? now + ' ' + line : line;
      btn.classList.add('is-used');
      contextBox.dispatchEvent(new Event('input', { bubbles: true }));
      contextBox.focus();
      contextBox.setSelectionRange(contextBox.value.length, contextBox.value.length);
    });
  }

  // ---- The stepper ----
  // Which rules belong to which screen. Optional fields (website, source) have no rule.
  var STEP_RULES = { improve: ['improve'], type: ['businessType'], context: ['context'], business: ['business'], contact: ['name', 'email', 'phone', 'consent'] };
  var stepper = { on: false, steps: [], index: 0, depth: 0 }; // depth: how many history entries this form has pushed
  var counterNow = form.querySelector('[data-q-current]');
  var counterAll = form.querySelector('[data-q-total]');
  var fill = form.querySelector('[data-q-fill]');
  var progress = form.querySelector('.q-progress');
  var restoredNote = form.querySelector('[data-q-restored]');

  function stepName(i) { return stepper.steps[i].getAttribute('data-step'); }

  function show(i, opts) {
    opts = opts || {};
    var prev = stepper.index;
    stepper.index = Math.max(0, Math.min(i, stepper.steps.length - 1));
    stepper.steps.forEach(function (s, n) { s.classList.toggle('is-current', n === stepper.index); });
    var total = stepper.steps.length;
    form.classList.toggle('is-first', stepper.index === 0);
    form.classList.toggle('is-last', stepper.index === total - 1);
    form.classList.toggle('is-back', stepper.index < prev);
    counterNow.textContent = stepper.index + 1;
    counterAll.textContent = total;
    fill.style.width = (100 * (stepper.index + 1) / total) + '%';
    progress.setAttribute('aria-hidden', 'true'); // announced through the status region instead
    failAlert.hidden = true;
    if (restoredNote) restoredNote.hidden = true; // the "welcome back" line only belongs to the screen they resumed on
    if (!opts.silent) {
      status.textContent = 'Question ' + (stepper.index + 1) + ' of ' + total;
      // Focus the question itself, so screen readers read it and keyboard users start in the right place.
      var title = stepper.steps[stepper.index].querySelector('.q-title');
      if (title) title.focus({ preventScroll: true });
      // Keep the top of the card in view on small screens.
      var top = form.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) form.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      track('form_step', (stepper.index + 1) + '/' + total + ' ' + stepName(stepper.index));
    }
    if (opts.history === 'push') { stepper.depth++; history.pushState({ reviewStep: stepper.index, reviewDepth: stepper.depth }, ''); }
    else if (opts.history === 'replace') history.replaceState({ reviewStep: stepper.index, reviewDepth: stepper.depth }, '');
    saveDraft();
  }

  function stepValid(i) {
    var bad = null;
    (STEP_RULES[stepName(i)] || []).forEach(function (name) {
      if (name === 'phone' && phoneField.hidden) return;
      if (validate(name) && !bad) bad = name;
    });
    return bad;
  }

  function focusField(name) {
    var wrap = fieldWrap(name);
    var el = wrap && wrap.querySelector('input:not([type="hidden"]), select, textarea');
    if (el) el.focus();
  }

  function next() {
    var bad = stepValid(stepper.index);
    if (bad) { focusField(bad); return; }
    if (stepper.index < stepper.steps.length - 1) show(stepper.index + 1, { history: 'push' });
  }

  function back() {
    if (stepper.index === 0) return;
    // Use the browser's history so the phone's Back gesture and this button agree.
    // Only step back through entries this form pushed; never off the page (after a refresh there may be none).
    if (stepper.depth > 0) history.back();
    else show(stepper.index - 1, { history: 'replace' });
  }

  function startStepper() {
    // Question 2 is skipped when the link already told us the business type.
    stepper.steps = Array.prototype.filter.call(form.querySelectorAll('.q-step'), function (s) {
      return !(typeFromLink && s.getAttribute('data-step') === 'type');
    });
    stepper.on = true;
    form.classList.add('is-stepper');
    // Picking up where they left off this session; else the first unanswered screen (the link may have answered some).
    var startAt = 0;
    if (draft && draft.step) {
      stepper.steps.forEach(function (s, n) { if (s.getAttribute('data-step') === draft.step) startAt = n; });
    }
    // Never land past a screen that still needs an answer.
    for (var n = 0; n < startAt; n++) {
      var needs = (STEP_RULES[stepName(n)] || []).some(function (name) {
        if (name === 'phone' || name === 'consent') return false;
        return !!rules[name](form.elements[name]);
      });
      if (needs) { startAt = n; break; }
    }
    show(startAt, { silent: true, history: 'replace' });
    if (restoredNote && draft && startAt > 0) restoredNote.hidden = false; // after show(), which hides it
    track('form_step', (startAt + 1) + '/' + stepper.steps.length + ' ' + stepName(startAt));

    form.querySelector('[data-q-next]').addEventListener('click', next);
    form.querySelector('[data-q-back]').addEventListener('click', back);

    window.addEventListener('popstate', function (e) {
      if (!e.state || typeof e.state.reviewStep !== 'number') return;
      var target = e.state.reviewStep;
      stepper.depth = e.state.reviewDepth || 0;
      // Going forward through history still has to pass each screen's checks.
      for (var k = stepper.index; k < target; k++) { var bad = stepValid(k); if (bad) { show(k, { history: 'replace' }); focusField(bad); return; } }
      show(target);
    });

    // Enter moves on (but not inside the text box, where it's a new line).
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      var t = e.target;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SELECT') return;
      if (stepper.index < stepper.steps.length - 1) { e.preventDefault(); next(); }
    });

    // Question 2: one tap (mouse or touch) and it moves on. Keyboard users choose with the arrows and press Continue.
    var typeStep = form.querySelector('[data-step="type"]');
    var pointerPick = false;
    typeStep.addEventListener('pointerdown', function () { pointerPick = true; });
    typeStep.addEventListener('change', function () {
      if (!pointerPick) return;
      pointerPick = false;
      setError('businessType', '');
      window.setTimeout(function () { if (stepName(stepper.index) === 'type') next(); }, 280);
    });
    typeStep.addEventListener('keydown', function () { pointerPick = false; });
  }

  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting) return; // prevents duplicate submissions
    // Implicit submit (Enter) before the last screen just moves on.
    if (stepper.on && stepper.index < stepper.steps.length - 1) { next(); return; }
    failAlert.hidden = true;

    var errors = [];
    Object.keys(rules).forEach(function (name) {
      if (name === 'phone' && phoneField.hidden) return;
      var message = validate(name);
      if (message) errors.push({ name: name, message: message });
    });

    summaryList.innerHTML = '';
    if (errors.length) {
      if (stepper.on) {
        // Go back to the first screen with a problem; its inline errors say what to fix.
        var first = fieldWrap(errors[0].name).closest('.q-step');
        var at = stepper.steps.indexOf(first);
        if (at === -1) { // business type was skipped from the link but is somehow empty: bring the screen back
          startOver();
          return;
        }
        if (at !== stepper.index) show(at, { history: 'push' });
        focusField(errors[0].name);
        return;
      }
      errors.forEach(function (err) {
        var li = document.createElement('li');
        li.setAttribute('data-name', err.name);
        var a = document.createElement('a');
        a.href = '#' + fieldWrap(err.name).querySelector('input, select, textarea').id;
        a.textContent = err.message;
        li.appendChild(a);
        summaryList.appendChild(li);
      });
      summary.hidden = false;
      summary.querySelector('h3 span').textContent = errors.length === 1 ? 'There is 1 thing to fix' : 'There are ' + errors.length + ' things to fix';
      summary.focus();
      return;
    }
    summary.hidden = true;

    // Submitting state: button locked with spinner; live region announces progress.
    submitting = true;
    submitBtn.classList.add('is-loading');
    submitBtn.setAttribute('aria-disabled', 'true');
    submitBtn.querySelector('span').textContent = 'Sending your request…';
    status.textContent = 'Sending your request…';

    function failed() {
      submitting = false;
      submitBtn.classList.remove('is-loading');
      submitBtn.removeAttribute('aria-disabled');
      submitBtn.querySelector('span').textContent = 'Request my review';
      status.textContent = '';
      // Failed state: every value stays in the form; nothing is lost.
      failAlert.hidden = false;
      failAlert.focus();
    }

    function succeeded() {
      track('form_submit');
      var ss = store(); if (ss) { try { ss.removeItem(STORE_KEY); } catch (err) { /* ignore */ } }
      // First name for the thank-you greeting, skipping honorifics ("Dr. Rahman" becomes "Rahman"). The button stays locked until we leave.
      var parts = form.elements.name.value.trim().split(/\s+/);
      var first = /^(dr|mr|mrs|ms|miss|prof|eng|md)\.?$/i.test(parts[0]) && parts[1] ? parts[1] : parts[0];
      try { sessionStorage.setItem('experius-review-name', first); } catch (err) { /* storage blocked: thank-you page falls back to a generic greeting */ }
      window.location.href = 'thank-you.html';
    }

    var cfg = window.EXPERIUS_BACKEND || {};
    if (!cfg.url || !cfg.anonKey) { window.setTimeout(failed, 600); return; } // backend not connected yet

    var el = form.elements;
    var visitor = window.experiusVisitor || {};
    var utm = visitor.utm || {};
    if (!Object.keys(utm).length) {
      var q = new URLSearchParams(window.location.search);
      ['source', 'medium', 'campaign', 'term', 'content'].forEach(function (k) { if (q.get('utm_' + k)) utm[k] = q.get('utm_' + k); });
    }
    var payload = {
      name: el.name.value, email: el.email.value, business: el.business.value, website: el.website.value,
      businessType: el.businessType.value, context: el.context.value, country: el.country.value,
      contactMethod: el.contactMethod.value, phone: el.phone.value, source: el.source.value,
      improve: checkedValues('improve'),
      consent: el.consent.checked, company_url: el.company_url.value,
      elapsed_ms: Date.now() - openedAt, page_path: window.location.pathname,
      utm: utm, visitor_id: visitor.id || null
    };
    var headers = { apikey: cfg.anonKey, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(cfg.anonKey)) headers.Authorization = 'Bearer ' + cfg.anonKey; // legacy JWT anon key

    fetch(cfg.url + '/rest/v1/rpc/submit_review_request', {
      method: 'POST', headers: headers, body: JSON.stringify({ payload: payload })
    }).then(function (res) {
      if (res.ok) return succeeded();
      return res.text().then(function (body) {
        if (window.console) console.warn('Business Review request rejected', res.status, body);
        failed();
      });
    }).catch(function (err) {
      if (window.console) console.warn('Business Review request could not be sent', err);
      failed();
    });
  });

  function startOver() {
    typeFromLink = false;
    stepper.steps = Array.prototype.slice.call(form.querySelectorAll('.q-step'));
    var at = stepper.steps.indexOf(form.querySelector('[data-step="type"]'));
    show(at, { history: 'push' });
  }

  summary.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    var target = document.querySelector(link.getAttribute('href'));
    if (target) { target.focus(); target.scrollIntoView({ block: 'center' }); }
  });

  // Last: switch to one question per screen. Any error above leaves the plain full form in place.
  try { startStepper(); } catch (err) {
    form.classList.remove('is-stepper');
    if (window.console) console.warn('Review form: stepper off, showing the full form', err);
  }
})();
