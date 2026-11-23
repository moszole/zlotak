/* Planner page glue (R-27, T-0178). Plain script, no network: the list lives in localStorage and the
   prices come from the catalog embedded in the page, evaluated by the shared engine (planner.js). */
(function (root) {
  'use strict';

  function storageKey(edition) {
    return 'zlotak.list.' + edition;
  }

  function loadList(storage, edition, validIds) {
    try {
      const raw = JSON.parse(storage.getItem(storageKey(edition)) || '[]');
      if (!Array.isArray(raw)) return [];
      const seen = [];
      for (const id of raw) {
        if (Number.isInteger(id) && validIds.indexOf(id) >= 0 && seen.indexOf(id) < 0) seen.push(id);
      }
      return seen;
    } catch (e) {
      return [];
    }
  }

  function saveList(storage, edition, ids) {
    storage.setItem(storageKey(edition), JSON.stringify(ids));
  }

  function formatGrosze(grosze, format) {
    const zl = Math.floor(grosze / 100);
    const gr = grosze % 100;
    return format
      .replace(/\{zl\}/, String(zl))
      .replace(/\{gr(?::02d)?\}/, (gr < 10 ? '0' : '') + gr);
  }

  /* Best (lowest) valid offer per group on data.date, evaluated by the shared engine. */
  function plan(data, engine, groupIds) {
    const offers = data.offers.map(function (o) {
      const copy = Object.assign({}, o);
      delete copy.group_id;
      return copy;
    });
    const out = JSON.parse(engine.selectDeals(JSON.stringify({ offers: offers }), data.date, Math.max(1, offers.length)));
    const valid = new Set(out.today_ids);
    const byId = {};
    data.groups.forEach(function (g) {
      byId[g.id] = g;
    });
    let known = 0;
    let total = 0;
    const rows = groupIds.map(function (gid) {
      let best = null;
      data.offers.forEach(function (o) {
        if (o.group_id !== gid || !valid.has(o.id)) return;
        const grosze = engine.plnToGrosze(o.price);
        if (best === null || grosze < best.grosze || (grosze === best.grosze && o.id < best.id)) {
          best = { id: o.id, grosze: grosze, retailer: data.retailers[String(o.retailer_id)], card: !!o.conditions.loyalty_card };
        }
      });
      if (best) {
        known += 1;
        total += best.grosze;
      }
      return { group: byId[gid], best: best };
    });
    return { rows: rows, known: known, total: total, complete: groupIds.length > 0 && known === groupIds.length };
  }

  function el(doc, tag, text) {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function init(doc, win) {
    const node = doc.getElementById('planner-data');
    if (!node) return;
    const data = JSON.parse(node.textContent);
    const engine = win.nakupPlanner;
    const select = doc.getElementById('planner-group');
    const rowsBody = doc.getElementById('planner-rows');
    const table = doc.getElementById('planner-table');
    const empty = doc.getElementById('planner-empty');
    const summary = doc.getElementById('planner-summary');
    const total = doc.getElementById('planner-total');
    const clear = doc.getElementById('planner-clear');
    const warning = doc.getElementById('planner-warning');
    const groupIds = data.groups.map(function (g) {
      return g.id;
    });
    let storage = null;
    try {
      storage = win.localStorage;
      storage.getItem(storageKey(data.edition));
    } catch (e) {
      storage = null;
      warning.textContent = data.text.no_storage;
    }
    let list = storage ? loadList(storage, data.edition, groupIds) : [];

    data.groups.forEach(function (g) {
      const option = el(doc, 'option', g.name);
      option.value = String(g.id);
      select.appendChild(option);
    });

    function persist() {
      if (!storage) return;
      try {
        saveList(storage, data.edition, list);
      } catch (e) {
        warning.textContent = data.text.no_storage;
      }
    }

    function render() {
      rowsBody.textContent = '';
      const result = plan(data, engine, list);
      result.rows.forEach(function (r) {
        const tr = el(doc, 'tr');
        tr.setAttribute('data-group', String(r.group.id));
        tr.appendChild(el(doc, 'th', r.group.name)).setAttribute('scope', 'row');
        const price = el(doc, 'td', r.best ? formatGrosze(r.best.grosze, data.price_format) : data.text.no_offer);
        const shop = el(doc, 'td', r.best ? r.best.retailer + (r.best.card ? ' (' + data.text.card + ')' : '') : '');
        const cell = el(doc, 'td');
        const button = el(doc, 'button', data.text.remove);
        button.type = 'button';
        button.setAttribute('aria-label', data.text.remove + ': ' + r.group.name);
        button.addEventListener('click', function () {
          list = list.filter(function (id) {
            return id !== r.group.id;
          });
          persist();
          render();
        });
        cell.appendChild(button);
        tr.appendChild(price);
        tr.appendChild(shop);
        tr.appendChild(cell);
        rowsBody.appendChild(tr);
      });
      const has = list.length > 0;
      table.hidden = !has;
      clear.hidden = !has;
      empty.hidden = has;
      summary.textContent = has ? data.text.coverage.replace('{n}', String(result.known)).replace('{m}', String(list.length)) : '';
      total.textContent = has && result.known > 0
        ? (result.complete ? data.text.sum_full : data.text.sum_partial) + ': ' + formatGrosze(result.total, data.price_format)
        : '';
    }

    doc.getElementById('planner-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const id = parseInt(select.value, 10);
      if (!Number.isInteger(id) || list.indexOf(id) >= 0) return;
      list.push(id);
      persist();
      render();
      select.value = '';
    });
    clear.addEventListener('click', function () {
      list = [];
      persist();
      render();
    });
    render();
  }

  const api = { storageKey: storageKey, loadList: loadList, saveList: saveList, formatGrosze: formatGrosze, plan: plan, init: init };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.nakupPlannerPage = api;
  if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', function () {
        init(root.document, root);
      });
    } else {
      init(root.document, root);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
