(() => {
  const state = {
    ysdk: null,
    player: null,
    lang: "ru",
    initialized: false,
    gameReadySent: false,
    gameplayActive: false,
    platformPaused: false
  };

  async function initSdk() {
    if (state.initialized) return state;
    if (!window.YaGames?.init) {
      console.info("Yandex Games SDK is unavailable outside the platform; local mode is active.");
      state.initialized = true;
      return state;
    }

    const ysdk = await window.YaGames.init();
    state.ysdk = ysdk;
    window.ysdk = ysdk;
    const platformLang = ysdk.environment?.i18n?.lang || "ru";
    const supportedLanguages = ["ru"];
    state.platformLang = platformLang;
    state.lang = supportedLanguages.includes(platformLang) ? platformLang : "ru";
    document.documentElement.lang = state.lang;
    document.documentElement.dataset.yandexLang = state.lang;
    document.documentElement.dataset.yandexPlatformLang = platformLang;

    try {
      state.player = await ysdk.getPlayer();
    } catch (error) {
      console.warn("Yandex Player initialization failed:", error);
    }

    const pause = () => {
      state.platformPaused = true;
      window.dispatchEvent(new CustomEvent("yandex-game-pause"));
    };
    const resume = () => {
      state.platformPaused = false;
      window.dispatchEvent(new CustomEvent("yandex-game-resume"));
    };
    ysdk.on?.("game_api_pause", pause);
    ysdk.on?.("game_api_resume", resume);

    state.initialized = true;
    window.dispatchEvent(new CustomEvent("yandex-sdk-ready", { detail: state }));
    return state;
  }

  async function gameReady() {
    if (state.gameReadySent) return;
    await initSdk();
    if (state.ysdk?.features?.LoadingAPI?.ready) {
      await state.ysdk.features.LoadingAPI.ready();
    }
    state.gameReadySent = true;
  }

  function gameplayStart() {
    if (state.platformPaused || state.gameplayActive) return;
    state.gameplayActive = true;
    try { state.ysdk?.features?.GameplayAPI?.start?.(); } catch {}
  }

  function gameplayStop() {
    if (!state.gameplayActive) return;
    state.gameplayActive = false;
    try { state.ysdk?.features?.GameplayAPI?.stop?.(); } catch {}
  }

  async function refreshPlayer() {
    await initSdk();
    if (!state.ysdk) return null;
    try {
      state.player = await state.ysdk.getPlayer();
      return state.player;
    } catch {
      return null;
    }
  }

  async function authorize() {
    await initSdk();
    if (!state.ysdk) return null;
    let player = state.player || await refreshPlayer();
    if (player?.isAuthorized?.()) return player;
    await state.ysdk.auth.openAuthDialog();
    player = await refreshPlayer();
    window.dispatchEvent(new CustomEvent("yandex-player-changed", { detail: player }));
    return player;
  }

  function isAuthorized() {
    return !!state.player?.isAuthorized?.();
  }

  async function getCloudProgress() {
    const player = state.player || await refreshPlayer();
    if (!player?.isAuthorized?.()) return null;
    const data = await player.getData(["chess_progress"]);
    return data?.chess_progress || null;
  }

  async function setCloudProgress(progress, flush = true) {
    const player = state.player || await refreshPlayer();
    if (!player?.isAuthorized?.()) return false;
    await player.setData({ chess_progress: progress }, flush);
    return true;
  }

  async function requestFullscreen() {
    await initSdk();
    const fullscreen = state.ysdk?.screen?.fullscreen;
    if (fullscreen?.status !== fullscreen?.STATUS_ON && fullscreen?.request) {
      try {
        await fullscreen.request();
        return true;
      } catch {}
    }
    const target = document.documentElement;
    try {
      if (document.fullscreenElement) return true;
      if (target.requestFullscreen) {
        await target.requestFullscreen({ navigationUI: "hide" });
        return true;
      }
      if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
        return true;
      }
    } catch {}
    return false;
  }

  window.YandexPlatform = {
    state,
    init: initSdk,
    gameReady,
    gameplayStart,
    gameplayStop,
    refreshPlayer,
    authorize,
    isAuthorized,
    getCloudProgress,
    setCloudProgress,
    requestFullscreen,
    get lang() { return state.lang; },
    get platformLang() { return state.platformLang || state.lang; },
    get player() { return state.player; },
    get ysdk() { return state.ysdk; }
  };

  // SDK initializes early; Game Ready is sent only after all page assets have loaded.
  initSdk().catch(error => console.warn("Yandex SDK init failed:", error));
  window.addEventListener("load", () => {
    gameReady().catch(error => console.warn("Game Ready failed:", error));
  }, { once: true });
})();