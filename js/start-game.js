// Resolve the platform language before constructing translated dynamic controls.
// SDK/account failures still allow local play.
document.querySelectorAll('main').forEach(screen => { screen.inert = true; });
window.YandexPlatform.init().catch(error => console.warn('Yandex SDK init failed:', error)).finally(() => {
  window.ChessI18n.lockLanguage();
  const script = document.createElement('script');
  script.src = 'js/game.js';
  script.onerror = () => { document.querySelectorAll('main').forEach(screen => { screen.inert = false; }); };
  document.head.append(script);
});
