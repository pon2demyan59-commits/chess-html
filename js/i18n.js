(() => {
  const supported = ['ru', 'en', 'es', 'de'];
  const storageKey = 'chess-language-v1';
  const normalize = code => String(code || '').toLowerCase().split(/[-_]/)[0];
  let saved = '';
  try { saved = normalize(localStorage.getItem(storageKey)); } catch {}
  if (!supported.includes(saved)) saved = '';
  let language = saved || normalize(navigator.language);
  if (!supported.includes(language)) language = 'en';
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  let languageLocked = false;
  function t(message, values = []) {
    const translated = language === 'ru' ? message : (window.CHESS_TRANSLATIONS[language]?.[message] ?? message);
    return translated.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
  }
  function translateStaticUI() {
    document.documentElement.lang = language;
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('script, style, [data-language-select]')) continue;
      if (!textSources.has(node)) textSources.set(node, node.nodeValue);
      const source = textSources.get(node);
      const trimmed = source.trim();
      if (!trimmed) continue;
      const translated = t(trimmed);
      node.nodeValue = source.replace(trimmed, translated);
    }
    for (const element of document.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
      let sources = attributeSources.get(element);
      if (!sources) { sources = {}; attributeSources.set(element, sources); }
      for (const attribute of ['aria-label', 'title', 'alt', 'placeholder']) {
        if (!element.hasAttribute(attribute)) continue;
        if (!(attribute in sources)) sources[attribute] = element.getAttribute(attribute);
        element.setAttribute(attribute, t(sources[attribute]));
      }
    }
    const selector = document.querySelector('[data-language-select]');
    if (selector) selector.value = language;
  }
  function usePlatformLanguage(code) {
    if (languageLocked) return;
    if (!saved) {
      const normalized = normalize(code);
      if (supported.includes(normalized)) language = normalized;
      else if (code) language = 'en';
    }
    translateStaticUI();
  }
  function chooseLanguage(code) {
    if (!supported.includes(code) || code === language) return;
    try { localStorage.setItem(storageKey, code); } catch { return; }
    // pagehide saves the current board and history before the language is reloaded.
    window.location.reload();
  }
  window.ChessI18n = {t, supported, usePlatformLanguage, lockLanguage() { languageLocked = true; }, get language() { return language; }};
  translateStaticUI();
  document.querySelector('[data-language-select]')?.addEventListener('change', event => chooseLanguage(event.target.value));
})();
