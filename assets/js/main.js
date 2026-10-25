// Comportements communes à toutes les pages. Aucune dépendance.
(() => {
  document.documentElement.classList.add('js');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // En-tête : filet au défilement + barre d'actions mobile après le premier écran.
  const header = $('[data-header]');
  const menu = $('[data-menu]');
  const dock = $('.dock');
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    header?.classList.toggle('is-scrolled', y > 8);
    // se cache en descendant, revient dès qu'on remonte
    if (Math.abs(y - lastY) > 6) {
      header?.classList.toggle('is-hidden', y > lastY && y > innerHeight * 0.8 && menu?.hidden !== false);
      lastY = y;
    }
    dock?.classList.toggle('is-visible', y > innerHeight * 0.6);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Menu mobile
  const toggle = $('[data-menu-toggle]');
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    header?.classList.toggle('menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    toggle.querySelector('.sr').textContent = open ? 'Fermer le menu' : 'Ouvrir le menu';
  };
  toggle?.addEventListener('click', () => setMenu(menu.hidden));
  addEventListener('keydown', (e) => e.key === 'Escape' && menu && !menu.hidden && setMenu(false));
  matchMedia('(min-width: 1101px)').addEventListener('change', (e) => e.matches && setMenu(false));

  // Apparitions au défilement (échelonnées par groupe)
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        const siblings = $$('.reveal', el.parentElement).filter((s) => !s.classList.contains('is-in'));
        el.style.transitionDelay = `${Math.min(siblings.indexOf(el), 5) * 70}ms`;
        el.classList.add('is-in');
        io.unobserve(el);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  $$('.reveal').forEach((el) => io.observe(el));

  // Compteurs animés
  const countIo = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const target = +el.dataset.count;
      countIo.unobserve(el);
      if (reduced) return;
      const t0 = performance.now();
      const dur = 1400;
      const tick = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach((el) => countIo.observe(el));

  // Préremplissage de l'objet du formulaire de contact (?sujet=…)
  const sujet = new URLSearchParams(location.search).get('sujet');
  const sujetInput = $('#c-sujet');
  if (sujet && sujetInput) sujetInput.value = sujet.slice(0, 120);

  // Année courante
  $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

  // Copier une adresse e-mail
  $$('[data-copy]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.classList.add('is-copied');
        btn.setAttribute('aria-label', 'Adresse copiée');
        setTimeout(() => btn.classList.remove('is-copied'), 1800);
      } catch {
        location.href = `mailto:${btn.dataset.copy}`;
      }
    }),
  );


  // Modale « Être rappelé »
  const dialog = $('#rappel');
  $$('[data-callback-open]').forEach((b) =>
    b.addEventListener('click', () => {
      if (menu && !menu.hidden) setMenu(false);
      dialog.showModal();
      dialog.querySelector('input')?.focus();
    }),
  );
  dialog?.addEventListener('click', (e) => e.target === dialog && dialog.close());
  $('[data-close]', dialog)?.addEventListener('click', () => dialog.close());

  // ---------- Envoi des formulaires ----------
  // Délai de saisie mesuré dans le navigateur, depuis la première interaction avec chaque formulaire
  // (à défaut, depuis l'ouverture de la page : un humain n'est jamais pris pour un robot)
  const pageStart = Date.now();
  const firstTouch = new WeakMap();
  ['focusin', 'input', 'pointerdown', 'keydown'].forEach((t) =>
    document.addEventListener(t, (e) => {
      const f = e.target.closest?.('form[data-form]');
      if (f && !firstTouch.has(f)) firstTouch.set(f, Date.now());
    }),
  );

  const clearErrors = (form) => {
    $$('.has-error', form).forEach((f) => f.classList.remove('has-error'));
    $$('.field-error', form).forEach((e) => e.remove());
  };

  const showError = (form, name, msg) => {
    const input = form.elements[name];
    const el = input instanceof RadioNodeList ? input[0] : input;
    if (!el) return;
    const wrap = el.closest('.field, .consent, .choice-group');
    if (!wrap) return;
    wrap.classList.add('has-error');
    if (!wrap.classList.contains('consent')) {
      const p = document.createElement('p');
      p.className = 'field-error';
      p.textContent = msg;
      wrap.append(p);
    }
    el.setAttribute('aria-invalid', 'true');
  };

  // L'erreur d'un champ disparaît dès qu'il devient valide
  ['input', 'change'].forEach((t) =>
    document.addEventListener(t, (e) => {
      const el = e.target;
      const wrap = el.closest?.('.has-error');
      if (!wrap || !el.checkValidity?.()) return;
      wrap.classList.remove('has-error');
      wrap.querySelector('.field-error')?.remove();
      wrap.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    }),
  );

  // Valide les champs natifs d'un conteneur ; renvoie true si tout est bon.
  window.AMRE_validate = (form, scope = form) => {
    let firstBad = null;
    $$('input, select, textarea', scope).forEach((el) => {
      if (el.closest('.hp') || el.type === 'file') return;
      el.removeAttribute('aria-invalid');
      const wrap = el.closest('.field, .consent, .choice-group');
      wrap?.classList.remove('has-error');
      wrap?.querySelector('.field-error')?.remove();
      if (el.checkValidity()) return;
      let msg = el.type === 'radio' ? 'Choisissez une option.' : el.tagName === 'SELECT' ? 'Sélectionnez une option.' : 'Champ requis.';
      if (el.validity.typeMismatch) msg = 'Format invalide.';
      else if (el.validity.tooShort) msg = `${el.minLength} caractères minimum.`;
      else if (el.validity.patternMismatch) msg = 'Numéro invalide.';
      showError(form, el.name, msg);
      firstBad ??= el;
    });
    firstBad?.focus();
    return !firstBad;
  };

  window.AMRE_submit = async (form, extra = {}) => {
    const status = $('.form-status', form);
    const btn = $('[type=submit]', form);
    clearErrors(form);
    status.className = 'form-status';
    status.textContent = '';
    if (!window.AMRE_validate(form)) {
      status.className = 'form-status is-err';
      status.textContent = 'Merci de compléter les champs signalés.';
      return false;
    }
    const data = new FormData(form);
    data.set('form', form.dataset.form);
    data.set('elapsed', String(Date.now() - (firstTouch.get(form) ?? pageStart)));
    Object.entries(extra).forEach(([k, v]) => (Array.isArray(v) ? v.forEach((f) => data.append(k, f)) : data.set(k, v)));
    btn.setAttribute('aria-busy', 'true');
    try {
      // Aperçu client (GitHub Pages, sans PHP) : envoi simulé, rien ne part
      const json = document.querySelector('meta[name="amre-preview"]')
        ? { ok: true, message: 'Aperçu du site : la demande n’est pas envoyée. Le formulaire sera actif une fois le site en ligne.' }
        : await fetch('/amre-preview/api/send.php', { method: 'POST', body: data, headers: { Accept: 'application/json' } })
            .then((res) => res.json())
            .catch(() => ({ ok: false, message: 'Réponse inattendue du serveur.' }));
      if (!json.ok) {
        Object.entries(json.errors || {}).forEach(([k, m]) => showError(form, k, m));
        throw new Error(json.message);
      }
      status.className = 'form-status is-ok';
      status.innerHTML = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4.5 4.5L19 7"/></svg>';
      status.append(json.message);
      form.reset();
      form.dispatchEvent(new CustomEvent('amre:sent'));
      return true;
    } catch (err) {
      status.className = 'form-status is-err';
      status.textContent = err.message || 'L’envoi a échoué. Réessayez ou appelez-nous.';
      return false;
    } finally {
      btn.removeAttribute('aria-busy');
    }
  };

  $$('form[data-form]:not([data-stepper])').forEach((form) =>
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await window.AMRE_submit(form);
      if (ok && form.closest('dialog')) setTimeout(() => form.closest('dialog').close(), 2600);
    }),
  );
})();
