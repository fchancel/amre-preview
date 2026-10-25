// Formulaire de devis en 3 étapes : validation par étape, préremplissage par l'URL,
// brouillon local, pièces jointes par glisser-déposer, récapitulatif.
(() => {
  const form = document.querySelector('[data-stepper]');
  if (!form) return;
  const $ = (s) => form.querySelector(s);
  const $$ = (s) => [...form.querySelectorAll(s)];
  const steps = $$('[data-step]');
  const tabs = $$('[data-step-tab]');
  const prev = $('[data-prev]');
  const next = $('[data-next]');
  const submit = $('[data-submit]');
  const bar = $('[data-step-bar]');
  const draftNote = $('[data-draft-note]');
  const KEY = 'amre-devis-draft';
  const MAX_FILES = 3;
  const MAX_BYTES = 10 * 1024 * 1024;
  let step = 1;

  const show = (n, focus = true) => {
    step = n;
    steps.forEach((s) => (s.hidden = +s.dataset.step !== n));
    tabs.forEach((t) => {
      const i = +t.dataset.stepTab;
      t.classList.toggle('is-current', i === n);
      t.classList.toggle('is-done', i < n);
    });
    bar.style.width = `${(n / steps.length) * 100}%`;
    prev.hidden = n === 1;
    next.hidden = n === steps.length;
    submit.hidden = n !== steps.length;
    if (n === steps.length) renderRecap();
    if (!focus) return;
    const top = form.getBoundingClientRect().top + scrollY - 100;
    if (scrollY > top) scrollTo({ top, behavior: 'smooth' });
    const legend = steps[n - 1].querySelector('legend');
    legend?.setAttribute('tabindex', '-1');
    legend?.focus({ preventScroll: true });
  };

  next.addEventListener('click', () => {
    if (window.AMRE_validate(form, steps[step - 1])) show(step + 1);
  });
  prev.addEventListener('click', () => show(step - 1));
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < steps.length) {
      e.preventDefault();
      next.click();
    }
  });

  // Compteur de caractères
  const msg = $('#d-message');
  const counter = form.querySelector('[data-count-for="d-message"]');
  const updateCount = () => {
    counter.textContent = msg.value.trim().length;
    counter.parentElement.classList.toggle('is-ok', msg.value.trim().length >= 30);
  };
  msg.addEventListener('input', updateCount);

  // ---------- Pièces jointes ----------
  const drop = $('[data-dropzone]');
  const fileInput = drop.querySelector('input');
  const list = $('[data-file-list]');
  let files = [];
  const fmt = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);
  const syncFiles = () => {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    fileInput.files = dt.files;
    list.innerHTML = '';
    files.forEach((f, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`;
      const name = document.createElement('span');
      name.textContent = f.name;
      const size = document.createElement('span');
      size.className = 'mono';
      size.textContent = fmt(f.size);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Retirer ${f.name}`);
      rm.innerHTML = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      rm.addEventListener('click', () => {
        files.splice(i, 1);
        syncFiles();
      });
      li.append(name, size, rm);
      list.append(li);
    });
  };
  const addFiles = (incoming) => {
    const errors = [];
    for (const f of incoming) {
      if (files.length >= MAX_FILES) { errors.push('3 fichiers maximum.'); break; }
      if (files.reduce((s, x) => s + x.size, 0) + f.size > MAX_BYTES) { errors.push(`« ${f.name} » dépasse la limite de 10 Mo au total.`); continue; }
      if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
    }
    syncFiles();
    const status = form.querySelector('.form-status');
    status.className = errors.length ? 'form-status is-err' : 'form-status';
    status.textContent = errors.join(' ');
  };
  fileInput.addEventListener('change', () => {
    const picked = [...fileInput.files];
    addFiles(picked.filter((f) => !files.includes(f)));
  });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    addFiles([...e.dataTransfer.files]);
  });

  // ---------- Récapitulatif ----------
  const recap = $('[data-recap]');
  const label = (name) => {
    const el = form.elements[name];
    if (!el) return '';
    if (el instanceof RadioNodeList && el[0]?.type === 'radio') {
      const c = [...el].find((r) => r.checked);
      return c ? c.closest('label').querySelector('strong').textContent : '';
    }
    if (el.tagName === 'SELECT') return el.value ? el.selectedOptions[0].textContent : '';
    return el.value.trim();
  };
  const renderRecap = () => {
    const apps = $$('[name="applications[]"]:checked').map((c) => c.value).join(', ');
    const rows = [
      ['Besoin', label('besoin')],
      ['Partenaire ou solution', label('fabricant')],
      ['Produit', label('produit')],
      ['Applications', apps],
      ['Lieu', label('lieu')],
      ['Échéance', label('echeance')],
      ['Pièces jointes', files.length ? `${files.length} fichier(s)` : ''],
    ].filter(([, v]) => v);
    recap.innerHTML = '<p class="mono">Récapitulatif</p><dl></dl>';
    const dl = recap.querySelector('dl');
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    });
  };

  // ---------- Brouillon local ----------
  const store = {
    get: () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
    set: (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
    clear: () => { try { localStorage.removeItem(KEY); } catch { /* idem */ } },
  };
  const SKIP = new Set(['website', 'consent', 'fichiers[]']);
  const snapshot = () => {
    const data = {};
    for (const el of form.elements) {
      if (!el.name || SKIP.has(el.name) || el.type === 'file') continue;
      if (el.type === 'checkbox') { (data[el.name] ??= []); if (el.checked) data[el.name].push(el.value); }
      else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else data[el.name] = el.value;
    }
    return data;
  };
  const restore = (data) => {
    for (const el of form.elements) {
      if (!(el.name in data) || el.type === 'file') continue;
      const v = data[el.name];
      if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.includes(el.value);
      else if (el.type === 'radio') el.checked = el.value === v;
      else el.value = v;
    }
  };
  let saveT;
  form.addEventListener('input', () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      store.set(snapshot());
      draftNote.hidden = false;
    }, 500);
  });

  const draft = store.get();
  if (draft) restore(draft);

  // Préremplissage depuis l'URL (prioritaire sur le brouillon)
  const params = new URLSearchParams(location.search);
  const besoin = params.get('besoin');
  if (besoin) {
    const r = form.querySelector(`[name=besoin][value="${CSS.escape(besoin)}"]`);
    if (r) r.checked = true;
  }
  if (params.get('fabricant')) $('#d-fabricant').value = params.get('fabricant');
  if (params.get('produit')) $('#d-produit').value = params.get('produit');
  if (params.get('lieu')) $('#d-lieu').value = params.get('lieu');
  updateCount();

  // ---------- Envoi ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Jamais d'envoi avant la dernière étape : Entrée ou bouton forcé ramènent à « Continuer ».
    if (step < steps.length) return next.click();
    // Chaque étape doit être valide : sinon on revient à la première qui ne l'est pas.
    const bad = steps.find((s) => !window.AMRE_validate(form, s));
    if (bad) return show(+bad.dataset.step);
    const ok = await window.AMRE_submit(form);
    if (!ok) return;
    store.clear();
    files = [];
    syncFiles();
    draftNote.hidden = true;
    recap.innerHTML = '';
    steps.forEach((s) => (s.hidden = true));
    $('.step-nav').hidden = true;
    form.querySelector('.stepper').hidden = true;
    bar.parentElement.hidden = true;
  });

  show(1, false);
})();
