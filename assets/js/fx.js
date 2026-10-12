// Mise en scène « pitch » : écrans actifs (entrées animées), navigation par points,
// compteur d'écran, barre de progression, en-tête qui s'adapte aux écrans clairs,
// compteur de pertes en direct avec niveau d'eau qui monte, statut « joignable ».
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- Titres découpés mot à mot (pages intérieures) ----------
  $$('[data-split]').forEach((el) => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/([ \t\n\r]+)/).forEach((part) => {
            if (!part) return;
            if (/^[ \t\n\r]+$/.test(part)) return frag.append(part);
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.transitionDelay = `${Math.min(i++, 18) * 40}ms`;
            w.append(inner);
            frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
    el.classList.add('is-split');
  });
  const once = new IntersectionObserver(
    (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); once.unobserve(en.target); } }),
    { rootMargin: '0px 0px -10% 0px' },
  );
  $$('[data-split]').forEach((el) => once.observe(el));

  // ---------- Écrans : activation à l'entrée (une seule fois) ----------
  const slides = $$('.slide');
  const act = new IntersectionObserver(
    (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-active'); act.unobserve(en.target); } }),
    { threshold: 0.2 },
  );
  slides.forEach((s) => act.observe(s));

  // ---------- Écran courant : points, compteur, en-tête, progression ----------
  const header = $('[data-header]');
  const pager = $('[data-pager]');
  const count = $('[data-slidecount]');
  const bar = $('[data-progress]');
  const pitch = [...$$('[data-slide]')];
  const dots = pager ? $$('a', pager) : [];
  const themed = $$('[data-theme]');
  let ticking = false;
  const update = () => {
    ticking = false;
    const h = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    // en-tête clair / sombre selon la section sous la barre
    const under = themed.find((s) => { const r = s.getBoundingClientRect(); return r.top <= 40 && r.bottom > 40; });
    header?.classList.toggle('is-light', under?.dataset.theme === 'light');
    // fond (flou) dès que le contenu commence à passer sous la barre, sur toutes les pages
    header?.classList.toggle('is-solid', scrollY > 10);
    if (!pager) return;
    let cur = 0;
    pitch.forEach((s, i) => { if (s.getBoundingClientRect().top < innerHeight * 0.5) cur = i; });
    dots.forEach((d, i) => d.classList.toggle('is-on', i === cur));
    const light = pitch[cur]?.dataset.theme === 'light';
    const last = cur === pitch.length - 1;
    pager.classList.toggle('is-off', last);
    count.classList.toggle('is-off', last);
    pager.classList.toggle('is-light', light);
    count.classList.toggle('is-light', light);
    $('[data-slidecount-n]', count).textContent = String(cur + 1).padStart(2, '0');
    $('[data-slidecount-l]', count).textContent = pitch[cur]?.dataset.slide || '';
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();

  // ---------- Statut « joignable » (heure de Paris, lun–ven 8 h 30 – 18 h) ----------
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const mins = (+parts.hour % 24) * 60 + +parts.minute;
  const open = day >= 0 && day <= 4 && mins >= 510 && mins < 1080;
  const statusTxt = open
    ? 'Joignable maintenant'
    : day <= 4 && mins < 510
      ? 'Joignable dès 8 h 30'
      : (day === 4 && mins >= 1080) || day >= 5
        ? 'Joignable lundi dès 8 h 30'
        : 'Joignable demain dès 8 h 30';
  $$('[data-status]').forEach((el) => {
    el.textContent = statusTxt;
    el.classList.toggle('is-open', open);
  });

  // ---------- Compteur de pertes en direct + niveau d'eau ----------
  const live = $('[data-live]');
  if (live) {
    const rate = +live.dataset.rate; // litres par seconde
    const out = $('[data-live-n]', live);
    const level = $('[data-level]');
    const fmt = new Intl.NumberFormat('fr-FR');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    // Le niveau ne monte que pendant que l'écran est visible : ~25 % en 10 s,
    // ~45 % en 30 s, puis il tend vers 62 % sans jamais tout recouvrir.
    const MAX = 62;
    const TAU = 28; // secondes
    let shown = 0; // ms cumulées à l'écran (horloge réelle, robuste aux images sautées)
    let since = 0; // début de la période visible en cours, 0 si hors écran
    let lastText = 0;
    if (level) {
      new IntersectionObserver(([en]) => {
        const now = performance.now();
        if (en.isIntersecting && !since) since = now;
        else if (!en.isIntersecting && since) { shown += now - since; since = 0; }
      }, { threshold: 0.25 }).observe(live.closest('section') || live);
      if (still) level.style.setProperty('--level', '30%');
    }
    const tick = (now) => {
      if (now - lastText > 50) {
        out.textContent = fmt.format(Math.round(((now - t0) / 1000) * rate)).replace(/\u202f/g, '\u00a0');
        lastText = now;
      }
      if (level && !still && since) {
        const sec = (shown + now - since) / 1000;
        level.style.setProperty('--level', `${(MAX * (1 - Math.exp(-sec / TAU))).toFixed(2)}%`);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})();
