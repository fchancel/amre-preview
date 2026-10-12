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

  // Recherche de département au fil de la frappe → carte de la page, ou /partenaires/?dep=73
  // Cherche par numéro (« 7 », « 2a »), par nom sans accents ni tirets (« cote d or »)
  // et, en bonus, par code postal (« 73340 »). Clavier : ↑ ↓ pour parcourir, Entrée pour choisir, Échap pour fermer.
  const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  $$('[data-dep-search]').forEach((form) => {
    const input = $('input', form);
    const list = $('[role="listbox"]', form);
    const status = $('[data-dep-status]', form);
    const deps = JSON.parse(form.dataset.deps).map(([code, name, n]) => ({ code, name, n, key: fold(name) }));
    let items = [];
    let active = -1;

    const search = (raw) => {
      const picked = raw.match(/^\s*(2[abAB]|\d{2,3})\s*·/); // valeur déjà choisie « 73 · Savoie »
      const q = fold(picked ? picked[1] : raw).replace(/\s+/g, ' ').trim();
      if (!q) return [];
      // 3 chiffres ou plus : début d'un code postal (« 733 », « 73340 ») → département des 2 premiers
      if (/^\d{3,5}$/.test(q)) {
        const c = q.slice(0, 2);
        return deps.filter((d) => (c === '20' ? /^2[AB]$/.test(d.code) : d.code === c));
      }
      const hits = [];
      for (const d of deps) {
        const code = d.code.toLowerCase();
        const at = d.key.indexOf(q);
        const rank =
          code === q || code === q.padStart(2, '0') ? 0
          : code.startsWith(q) ? 1
          : at === 0 ? 2
          : at > 0 && d.key[at - 1] === ' ' ? 3
          : at > 0 ? 4
          : -1;
        if (rank >= 0) hits.push({ ...d, rank, at: rank > 1 ? at : -1, len: q.length });
      }
      return hits.sort((x, y) => x.rank - y.rank || x.code.localeCompare(y.code)).slice(0, 8);
    };

    const open = (on) => {
      list.hidden = !on;
      input.setAttribute('aria-expanded', on);
      if (!on) input.removeAttribute('aria-activedescendant');
    };

    const highlight = (i) => {
      active = i;
      $$('[role="option"]', list).forEach((li, j) => li.setAttribute('aria-selected', j === i));
      const li = list.children[i];
      if (li?.id) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    };

    const render = () => {
      items = search(input.value);
      if (!input.value.trim()) {
        open(false);
        status.textContent = '';
        return;
      }
      list.innerHTML = items.length
        ? items
            .map((d, i) => {
              const name = d.at >= 0
                ? `${escHtml(d.name.slice(0, d.at))}<mark>${escHtml(d.name.slice(d.at, d.at + d.len))}</mark>${escHtml(d.name.slice(d.at + d.len))}`
                : escHtml(d.name);
              return `<li role="option" id="${list.id}-${d.code}" data-i="${i}" aria-selected="false"><b>${d.code}</b><span>${name}</span><small>${d.n} fabricant${d.n > 1 ? 's' : ''}</small></li>`;
            })
            .join('')
        : `<li class="dep-none">Aucun département pour « ${escHtml(input.value.trim())} »</li>`;
      status.textContent = items.length ? `${items.length} département${items.length > 1 ? 's' : ''} trouvé${items.length > 1 ? 's' : ''}` : 'Aucun département trouvé';
      open(true);
      highlight(items.length ? 0 : -1);
    };

    const choose = (d) => {
      input.value = `${d.code} · ${d.name}`;
      open(false);
      status.textContent = `${d.name} sélectionné`;
      if (window.AMRE_selectDep) window.AMRE_selectDep(d.code, true);
      else location.href = `/amre-preview/partenaires/?dep=${encodeURIComponent(d.code)}#carte`;
    };

    input.addEventListener('input', render);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('blur', () => setTimeout(() => open(false), 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) return render();
        if (!items.length) return;
        highlight((active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
      } else if (e.key === 'Enter' && !list.hidden && items[active]) {
        e.preventDefault();
        choose(items[active]);
      } else if (e.key === 'Escape') {
        if (!list.hidden) open(false);
        else input.value = '';
      }
    });
    list.addEventListener('pointerdown', (e) => e.preventDefault()); // garde le focus dans le champ
    list.addEventListener('click', (e) => {
      const li = e.target.closest('[role="option"]');
      if (li) choose(items[+li.dataset.i]);
    });
    list.addEventListener('pointermove', (e) => {
      const li = e.target.closest('[role="option"]');
      if (li && +li.dataset.i !== active) highlight(+li.dataset.i);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = search(input.value)[0];
      if (d) choose(d);
      else render();
    });
  });

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
