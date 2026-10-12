// Carte interactive des départements (accueil et page Partenaires).
(() => {
  const dataEl = document.getElementById('coverage-data');
  const svg = document.querySelector('.fr-map');
  const out = document.querySelector('[data-dep-result]');
  if (!dataEl || !svg || !out) return;
  const { deps, partners } = JSON.parse(dataEl.textContent);

  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // « 73 », « 73 · Savoie », « savoie », « 2a », « 7 » → code département ou null
  window.AMRE_parseDep = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return null;
    const m = v.match(/^(2[abAB]|\d{1,2})\b/);
    if (m) {
      const c = m[1].toUpperCase().padStart(2, '0');
      if (deps[c]) return c;
    }
    const n = norm(v.replace(/^\S+\s*·\s*/, ''));
    const hit = Object.entries(deps).find(([, d]) => norm(d.n) === n) || Object.entries(deps).find(([, d]) => norm(d.n).startsWith(n));
    return hit ? hit[0] : null;
  };

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  let current = null;
  const select = (code, scroll) => {
    code = window.AMRE_parseDep(code);
    if (!code) {
      out.innerHTML = '<p class="coverage-empty">Département introuvable. Essayez son numéro, par exemple <strong>&nbsp;73</strong>.</p>';
      return;
    }
    current?.classList.remove('is-active');
    current = svg.querySelector(`[data-dep="${code}"]`);
    current?.classList.add('is-active');
    current?.parentNode.append(current); // passe au premier plan
    svg.classList.add('is-dim');
    const d = deps[code];
    out.innerHTML = `
      <div class="dep-head"><span class="dep-code">${code}</span><span class="dep-name">${esc(d.n)}</span></div>
      <p class="dep-count">${d.p.length} fabricant${d.p.length > 1 ? 's' : ''} disponible${d.p.length > 1 ? 's' : ''}</p>
      <ul class="dep-partners">
        ${d.p
          .map((id) => {
            const p = partners[id];
            return `<li><img src="${p.logo}" alt=""><div><strong>${esc(p.name)}</strong><span>${esc(p.ranges.slice(0, 3).join(' · '))}</span></div></li>`;
          })
          .join('')}
      </ul>
      <div class="dep-actions">
        <a class="btn btn-primary btn-sm" href="/amre-preview/devis/?lieu=${encodeURIComponent(code + ' – ' + d.n)}">Devis pour le ${code}</a>
        ${d.p.map((id) => `<a class="btn btn-ghost btn-sm" href="/amre-preview/partenaires/#${id}">${esc(partners[id].name)}</a>`).join('')}
      </div>`;
    const input = document.getElementById('dep-map');
    if (input) input.value = `${code} · ${d.n}`;
    const url = new URL(location.href);
    url.searchParams.set('dep', code);
    history.replaceState(null, '', url);
    if (scroll && matchMedia('(max-width: 900px)').matches) out.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  window.AMRE_selectDep = select;

  svg.addEventListener('click', (e) => {
    const p = e.target.closest('[data-dep]');
    if (p) select(p.dataset.dep, true);
  });
  svg.addEventListener('keydown', (e) => {
    const p = e.target.closest('[data-dep]');
    if (p && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      select(p.dataset.dep, true);
    }
  });

  // Repère du siège (position calculée au build, en % de la carte)
  const home = document.querySelector('[data-home]');
  if (home) {
    const place = () => {
      const r = svg.getBoundingClientRect();
      const w = home.parentElement.getBoundingClientRect();
      home.style.left = `${r.left - w.left + (r.width * home.dataset.x) / 100}px`;
      home.style.top = `${r.top - w.top + (r.height * home.dataset.y) / 100}px`;
    };
    place();
    addEventListener('resize', place);
    addEventListener('load', place);
  }

  const initial = new URLSearchParams(location.search).get('dep');
  if (initial) select(initial, false);
})();
