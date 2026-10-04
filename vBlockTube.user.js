// ==UserScript==
// @name         vBlockTube
// @namespace    https://www.github.com/vippium/
// @version      2.0.1
// @description  Blocks YouTube ads and provides enhanced features for a better viewing experience.
// @author       vippium
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @match        https://www.youtubekids.com/*
// @exclude      https://www.youtube.com/live_chat*
// @exclude      https://www.youtube.com/embed*
// @connect      api.sponsor.ajay.app
// @connect      update.greasyfork.org
// @connect      cnv.cx
// @connect      returnyoutubedislikeapi.com
// @connect      googlevideo.com
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_setClipboard
// @grant        GM_listValues
// @grant        GM_deleteValue
// @run-at       document-start
// @icon         https://cdn.iconscout.com/icon/free/png-256/free-youtube-logo-icon-svg-download-png-3649968.png?f=webp
// @homepageURL  https://github.com/vippium/vBlockTube
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/557720/vBlockTube.user.js
// @updateURL https://update.greasyfork.org/scripts/557720/vBlockTube.meta.js
// ==/UserScript==

(function () {
  let uuid = GM_getValue("uuid");
  if (!uuid) {
    uuid = crypto
      .randomUUID()
      .substring(0, Math.floor(Math.random() * 5) + 6)
      .replace(/-/g, "");
    GM_setValue("uuid", uuid);
  }

  if (unsafeWindow[uuid]) {
    console.log("Duplicate injection!");
    return;
  }

  unsafeWindow[uuid] = true;

  let debugger_fun_name;

  const disableRemovePlayerAd = false;

  const open_config_keyword = "2333";

  let channel_id = GM_getValue("last_channel_id", "default");

  const user_data_listener = get_user_data_listener();
  const user_data_api = get_user_data_api();
  let user_data = user_data_api.get();

  let tmp_debugger_value;

  let limit_eval = false;

  let element_monitor_observer;

  let is_account_init;

  let fake_fetch;

  const inject_info = {
    ytInitialPlayerResponse: false,
    ytInitialData: false,
    ytInitialReelWatchSequenceResponse: false,
    xhr: false,
    fetch: false,
  };

  const $ = unsafeWindow.document.querySelector.bind(unsafeWindow.document);
  const $$ = unsafeWindow.document.querySelectorAll.bind(unsafeWindow.document);


  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  const throttle = (func, limit) => {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  };

  // Selector Caching System
  const selectorCache = {
    cache: new Map(),
    ttl: 5000,
    timestamps: new Map(),
    frequentSelectors: {
      video: "video",
      player: ".html5-video-player",
      secondary: "#secondary",
      videoContainer: ".html5-video-container",
      playerContainer: "#movie_player",
    },

    get(selector) {
      const now = Date.now();
      const timestamp = this.timestamps.get(selector);

      if (this.cache.has(selector) && timestamp && now - timestamp < this.ttl) {
        return this.cache.get(selector);
      }

      try {
        const element = $(selector);
        if (element) {
          this.cache.set(selector, element);
          this.timestamps.set(selector, now);
          return element;
        }
      } catch (e) {}

      this.cache.delete(selector);
      this.timestamps.delete(selector);
      return null;
    },

    getVideo() {
      return this.get(this.frequentSelectors.video);
    },

    getPlayer() {
      return this.get(this.frequentSelectors.player);
    },

    getSecondary() {
      return this.get(this.frequentSelectors.secondary);
    },

    getVideoContainer() {
      return this.get(this.frequentSelectors.videoContainer);
    },

    getPlayerContainer() {
      return this.get(this.frequentSelectors.playerContainer);
    },

    invalidate(selector) {
      this.cache.delete(selector);
      this.timestamps.delete(selector);
    },

    invalidateAll() {
      this.cache.clear();
      this.timestamps.clear();
    },
  };

  const observerManager = {
    observers: new Map(),
    listeners: new Map(),
    mediaQueryListeners: [],

    addObserver(name, observer) {
      if (this.observers.has(name)) {
        this.observers.get(name).disconnect();
      }
      this.observers.set(name, observer);
    },

    removeObserver(name) {
      if (this.observers.has(name)) {
        this.observers.get(name).disconnect();
        this.observers.delete(name);
      }
    },

    addListener(target, eventName, handler, options) {
      if (!target) return;
      target.addEventListener(eventName, handler, options);
      const key = `${target.nodeName || "window"}_${eventName}`;
      if (!this.listeners.has(key)) {
        this.listeners.set(key, []);
      }
      this.listeners.get(key).push({ target, eventName, handler, options });
    },

    addMediaQueryListener(mql, handler) {
      mql.addListener(handler);
      this.mediaQueryListeners.push({ mql, handler });
    },

    disconnectAll() {
      for (const [name, observer] of this.observers) {
        observer.disconnect();
      }
      this.observers.clear();

      for (const [key, listeners] of this.listeners) {
        for (const { target, eventName, handler } of listeners) {
          target.removeEventListener(eventName, handler);
        }
      }
      this.listeners.clear();

      for (const { mql, handler } of this.mediaQueryListeners) {
        mql.removeListener(handler);
      }
      this.mediaQueryListeners = [];
    },

    logStats() {
      log(
        `[ObserverManager] Observers: ${this.observers.size}, Listeners: ${this.listeners.size}, MediaQueries: ${this.mediaQueryListeners.length}`,
        0,
      );
    },
  };

  const darkModeSystem = {
    styleId: "vblocktube-dark-mode-style",
    isDarkMode: false,
    mediaQuery: null,
    mediaListener: null,

    getSystemPreference() {
      return unsafeWindow.matchMedia("(prefers-color-scheme: dark)").matches;
    },

    shouldUseDarkMode() {
      if (!user_data.dark_mode) return false;
      if (user_data.dark_mode === "on") return true;
      if (user_data.dark_mode === "off") return false;
      if (user_data.dark_mode === "auto") return this.getSystemPreference();
      return false;
    },

    apply() {
      this.isDarkMode = this.shouldUseDarkMode();
      // The settings page themes itself; remove any style left by older versions.
      const existing = unsafeWindow.document.getElementById(this.styleId);
      if (existing) existing.remove();
    },

    init() {
      if (!this.mediaQuery) {
        this.mediaQuery = unsafeWindow.matchMedia(
          "(prefers-color-scheme: dark)",
        );
        this.mediaListener = (e) => {
          if (user_data.dark_mode === "auto") {
            this.apply();
          }
        };
        this.mediaQuery.addListener(this.mediaListener);
        observerManager.addMediaQueryListener(
          this.mediaQuery,
          this.mediaListener,
        );
      }
    },

    destroy() {
      if (this.mediaQuery && this.mediaListener) {
        this.mediaQuery.removeListener(this.mediaListener);
      }
    },
  };

  const origin_console = console;
  const script_url =
    "https://update.greasyfork.org/scripts/557720/vBlockTube.user.js";
  let href = location.href;
  let ytInitialPlayerResponse_rule;
  let ytInitialData_rule;
  let ytInitialReelWatchSequenceResponse_rule;
  let open_debugger = false;
  let isinint = false;
  let mobile_web;
  let movie_channel_info;
  let mobile_movie_channel_info;
  let flag_info;

  let debugger_ytInitialPlayerResponse;
  let debugger_ytInitialData;
  let debugger_ytInitialReelWatchSequenceResponse;
  let debugger_music_initialData;
  const error_messages = [];
  let data_process = get_data_process();
  let shorts_fun = get_shorts_fun();
  let yt_api = get_yt_api();
  const shorts_parse_delay = 500;
  const browser_info = getBrowserInfo();
  let page_type = get_page_type();
  const config_api = get_config_api();
  if (disableRemovePlayerAd) {
    config_api.common_ytInitialPlayerResponse_rule =
      config_api.common_ytInitialPlayerResponse_rule.slice(3);
  }
  const SPLIT_TAG = "###";
  let cur_watch_channle_id;
  const trustedScript = trustedScriptInit();
  setSecurePolicy();

  const QUALITY_ORDER = [
    "highres",
    "hd4320",
    "hd2880",
    "hd2160",
    "hd1440",
    "hd1080",
    "hd720",
    "large",
    "medium",
    "small",
    "tiny",
    "auto",
  ];

  function init_old_player_ui() {
    if (user_data.old_player_ui !== "on") return;

    const DELHI_FLAGS_REGEX =
      /&?delhi_modern_web_player(?:=true)?|&?delhi_modern_web_player_icons=true/g;
    const STYLE_ID = "yt-old-player-ui-style";

    function stripDelhiFlags() {
      const yt = unsafeWindow.yt;
      if (!yt?.config_?.WEB_PLAYER_CONTEXT_CONFIGS) return false;
      let changed = false;
      for (const key in yt.config_.WEB_PLAYER_CONTEXT_CONFIGS) {
        const cfg = yt.config_.WEB_PLAYER_CONTEXT_CONFIGS[key];
        if (typeof cfg?.serializedExperimentFlags === "string") {
          const cleaned = cfg.serializedExperimentFlags
            .replace(DELHI_FLAGS_REGEX, "")
            .replace(/&&+/g, "&")
            .replace(/^&|&$/g, "");
          if (cleaned !== cfg.serializedExperimentFlags) {
            cfg.serializedExperimentFlags = cleaned;
            changed = true;
          }
        }
      }
      return changed;
    }

    function injectOldPlayerCSS() {
      if (unsafeWindow.document.getElementById(STYLE_ID)) return;
      const style = unsafeWindow.document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .ytp-fullscreen-quick-actions,
        .ytp-fullscreen-grid {
          display: none !important;
        }
      `;
      (unsafeWindow.document.head || unsafeWindow.document.documentElement).appendChild(style);
    }

    injectOldPlayerCSS();

    const observer = new MutationObserver(() => {
      if (stripDelhiFlags()) {
        observer.disconnect();
      }
    });
    observer.observe(unsafeWindow.document.documentElement, {
      childList: true,
      subtree: false,
    });

    unsafeWindow.addEventListener("yt-navigate-finish", () => {
      stripDelhiFlags();
      injectOldPlayerCSS();
    });
  }

  function init_quality_preset() {
    const setQuality = () => {
      try {
        if (!user_data.default_quality || user_data.default_quality === "off")
          return;

        const video = selectorCache.getVideo();
        if (!video) return;

        const player = selectorCache.getPlayer();
        if (!player) return;

        const targetQuality = user_data.default_quality;
        const levels = player.getAvailableQualityLevels?.();
        if (!levels || levels.length === 0) return;

        const startIndex = QUALITY_ORDER.indexOf(targetQuality);
        const candidates =
          startIndex >= 0 ? QUALITY_ORDER.slice(startIndex) : QUALITY_ORDER;
        const chosen =
          candidates.find((q) => levels.includes(q)) ||
          levels[levels.length - 1];

        if (chosen && player.getPlaybackQualityLabel?.() !== chosen) {
          player.setPlaybackQualityRange?.(chosen, chosen);
        }
      } catch (e) {}
    };

    const observer = new MutationObserver(() => {
      const video = selectorCache.getVideo();
      if (video && !video.hasAttribute("data-quality-set")) {
        video.setAttribute("data-quality-set", "true");
        observerManager.addListener(video, "loadeddata", setQuality, {
          once: true,
        });
        debounce(setQuality, 300)();
      }
    });

    observer.observe($("body"), { childList: true, subtree: true });
    observerManager.addObserver("quality_preset", observer);
  }

  function init_speed_preset() {
    const setSpeed = () => {
      try {
        if (!user_data.default_speed) return;

        const video = selectorCache.getVideo();
        if (!video) return;

        const targetSpeed = parseFloat(user_data.default_speed);
        if (video.playbackRate !== targetSpeed) {
          video.playbackRate = targetSpeed;
        }
      } catch (e) {}
    };

    const debouncedSetSpeed = debounce(setSpeed, 300);
    const observer = new MutationObserver(() => {
      const video = selectorCache.getVideo();
      if (video && !video.hasAttribute("data-speed-set")) {
        video.setAttribute("data-speed-set", "true");
        debouncedSetSpeed();
        observerManager.addListener(video, "loadeddata", setSpeed, {
          once: true,
        });
      }
    });

    observer.observe($("body"), { childList: true, subtree: true });
    observerManager.addObserver("speed_preset", observer);
  }


  function init_restore_red_progress_bar() {
    if (user_data.restore_red_progress_bar !== "on") return;

    const style = unsafeWindow.document.createElement("style");
    style.textContent = `
        .ytp-play-progress,
        #progress.ytd-thumbnail-overlay-resume-playback-renderer,
        .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment,
        .ytChapteredProgressBarChapteredPlayerBarChapterSeen,
        .ytChapteredProgressBarChapteredPlayerBarFill,
        .ytProgressBarLineProgressBarPlayed,
        #progress.yt-page-navigation-progress,
        .progress-bar-played.ytd-progress-bar-line,
        .thumbnail-overlay-resume-playback-progress {
          background: #f03 !important;
        }
      `;
    unsafeWindow.document.head.appendChild(style);
  }

  function init_search_thumbnail_small() {
    if (user_data.search_thumbnail_small !== "on") return;

    const style = unsafeWindow.document.createElement("style");
    style.textContent = `
        ytd-search ytd-video-renderer ytd-thumbnail.ytd-video-renderer,
        ytd-search ytd-movie-renderer .thumbnail-container.ytd-movie-renderer,
        ytd-search yt-lockup-view-model .ytLockupViewModelContentImage,
        ytd-search yt-lockup-view-model .yt-lockup-view-model__content-image,
        ytd-search ytd-channel-renderer #avatar-section {
          max-width: 360px !important;
        }
      `;
    unsafeWindow.document.head.appendChild(style);
  }

  function init_restore_related_sidebar_layout() {
    if (user_data.restore_related_sidebar_layout !== "on") return;
    if (!["yt_watch"].includes(page_type)) return;

    const style = unsafeWindow.document.createElement("style");
    style.textContent = `
        ytd-watch-flexy #secondary {
          --ytd-watch-flexy-sidebar-width: 402px !important;
          --ytd-watch-flexy-sidebar-min-width: 300px !important;
          max-width: var(--ytd-watch-flexy-sidebar-width) !important;
        }

        #secondary #related .ytLockupViewModelVertical {
          flex-direction: row !important;
          height: inherit !important;
        }

        #secondary #related .ytLockupViewModelVertical .ytLockupViewModelContentImage {
          display: flex !important;
          flex: none !important;
          padding-right: 16px !important;
          justify-content: center !important;
          max-width: 500px !important;
          width: 168px !important;
          padding-bottom: 0 !important;
        }

        #secondary #related .ytLockupViewModelContentImage {
          max-width: 168px !important;
        }

        #secondary #related .ytLockupViewModelVertical .ytLockupViewModelMetadata {
          flex: 1 !important;
        }

        #secondary #related .ytLockupViewModelVertical.ytLockupViewModelCollectionStack1 {
          position: relative !important;
          margin-top: 6px !important;
        }

        #secondary #related .ytLockupViewModelVertical.ytLockupViewModelCollectionStack2 {
          position: relative !important;
          margin-top: 10px !important;
        }

        #secondary #related .ytLockupViewModelHorizontal.ytLockupViewModelCompact .ytLockupViewModelContentImage {
          padding-right: 8px !important;
        }

        #secondary #related .ytLockupViewModelVertical .ytLockupMetadataViewModelAvatar {
          display: none !important;
        }

        #secondary #related ytd-watch-next-secondary-results-renderer[use-dynamic-secondary-columns]:not(:has(ytd-item-section-renderer)) #items.ytd-watch-next-secondary-results-renderer,
        #secondary #related ytd-watch-next-secondary-results-renderer[use-dynamic-secondary-columns] #contents.ytd-item-section-renderer {
          grid-template-columns: 1fr !important;
        }

        #secondary #related ytd-watch-next-secondary-results-renderer[use-dynamic-secondary-columns] .lockup.ytd-watch-next-secondary-results-renderer {
          margin-bottom: 0 !important;
        }
      `;
    unsafeWindow.document.head.appendChild(style);
  }

  function restore_sidebar_layout_on_ytInitialData(data) {
    return data;
  }

  // Premium-style logo for YouTube and YouTube Music.
  // Internal setting only (user_data.premium_logo, default "on"); no UI row.
  function init_premium_logo() {
    if (user_data.premium_logo !== "on") return;
    const host = location.hostname;
    const is_music = host === "music.youtube.com";
    const is_yt = host === "www.youtube.com" || host === "youtube.com";
    if (!is_music && !is_yt) return;

    const doc = unsafeWindow.document;
    const STYLE_ID = "vbt-premium-logo-style";
    const LOGO_MAIN =
      "data:image/svg+xml,%3Csvg xmlns:dc=\'http://purl.org/dc/elements/1.1/\' xmlns:cc=\'http://creativecommons.org/ns%23\' xmlns:rdf=\'http://www.w3.org/1999/02/22-rdf-syntax-ns%23\' xmlns:svg=\'http://www.w3.org/2000/svg\' xmlns=\'http://www.w3.org/2000/svg\' id=\'SVGRoot\' version=\'1.1\' viewBox=\'0 0 846 174\' height=\'80px\' width=\'391px\'%3E%3Cdefs id=\'defs855\'%3E%3Cstyle id=\'style2\' /%3E%3C/defs%3E%3Cmetadata id=\'metadata858\'%3E%3Crdf:RDF%3E%3Ccc:Work rdf:about=\'\'%3E%3Cdc:format%3Eimage/svg+xml%3C/dc:format%3E%3Cdc:type rdf:resource=\'http://purl.org/dc/dcmitype/StillImage\' /%3E%3Cdc:title%3E%3C/dc:title%3E%3C/cc:Work%3E%3C/rdf:RDF%3E%3C/metadata%3E%3Cg id=\'layer1\'%3E%3Cg transform=\'translate(0,0.36)\' data-name=\'Layer 2\' id=\'Layer_2\'%3E%3Cg data-name=\'Layer 1\' id=\'Layer_1-2\'%3E%3Cpath style=\'fill:%23ff0000\' id=\'path6\' d=\'M 242.88,27.11 A 31.07,31.07 0 0 0 220.95,5.18 C 201.6,0 124,0 124,0 124,0 46.46,0 27.11,5.18 A 31.07,31.07 0 0 0 5.18,27.11 C 0,46.46 0,86.82 0,86.82 c 0,0 0,40.36 5.18,59.71 a 31.07,31.07 0 0 0 21.93,21.93 c 19.35,5.18 96.92,5.18 96.92,5.18 0,0 77.57,0 96.92,-5.18 a 31.07,31.07 0 0 0 21.93,-21.93 c 5.18,-19.35 5.18,-59.71 5.18,-59.71 0,0 0,-40.36 -5.18,-59.71 z\' /%3E%3Cpath style=\'fill:%23ffffff\' id=\'path8\' d=\'M 99.22,124.03 163.67,86.82 99.22,49.61 Z\' /%3E%3Cpath style=\'fill:%23282828\' id=\'path10\' d=\'m 358.29,55.1 v 6 c 0,30 -13.3,47.53 -42.39,47.53 h -4.43 v 52.5 H 287.71 V 12.36 H 318 c 27.7,0 40.29,11.71 40.29,42.74 z m -25,2.13 c 0,-21.64 -3.9,-26.78 -17.38,-26.78 h -4.43 v 60.48 h 4.08 c 12.77,0 17.74,-9.22 17.74,-29.26 z m 81.22,-6.56 -1.24,28.2 c -10.11,-2.13 -18.45,-0.53 -22.17,6 v 76.26 H 367.52 V 52.44 h 18.8 L 388.45,76 h 0.89 c 2.48,-17.2 10.46,-25.89 20.75,-25.89 a 22.84,22.84 0 0 1 4.42,0.56 z M 441.64,115 v 5.5 c 0,19.16 1.06,25.72 9.22,25.72 7.8,0 9.58,-6 9.75,-18.44 l 21.1,1.24 c 1.6,23.41 -10.64,33.87 -31.39,33.87 -25.18,0 -32.63,-16.49 -32.63,-46.46 v -19 c 0,-31.57 8.34,-47 33.34,-47 25.18,0 31.57,13.12 31.57,45.93 V 115 Z m 0,-22.35 v 7.8 h 17.91 V 92.7 c 0,-20 -1.42,-25.72 -9,-25.72 -7.58,0 -8.91,5.86 -8.91,25.72 z M 604.45,79 v 82.11 H 580 V 80.82 c 0,-8.87 -2.31,-13.3 -7.63,-13.3 -4.26,0 -8.16,2.48 -10.82,7.09 a 35.59,35.59 0 0 1 0.18,4.43 v 82.11 H 537.24 V 80.82 c 0,-8.87 -2.31,-13.3 -7.63,-13.3 -4.26,0 -8,2.48 -10.64,6.92 v 86.72 H 494.5 V 52.44 h 19.33 L 516,66.28 h 0.35 c 5.5,-10.46 14.37,-16.14 24.83,-16.14 10.29,0 16.14,5.14 18.8,14.37 5.68,-9.4 14.19,-14.37 23.94,-14.37 14.86,0 20.53,10.64 20.53,28.86 z m 12.24,-54.4 c 0,-11.71 4.26,-15.07 13.3,-15.07 9.22,0 13.3,3.9 13.3,15.07 0,12.06 -4.08,15.08 -13.3,15.08 -9.04,-0.01 -13.3,-3.02 -13.3,-15.08 z m 1.42,27.84 h 23.41 v 108.72 h -23.41 z m 103.39,0 v 108.72 h -19.15 l -2.13,-13.3 h -0.53 c -5.5,10.64 -13.48,15.07 -23.41,15.07 -14.54,0 -21.11,-9.22 -21.11,-29.26 V 52.44 h 24.47 v 79.81 c 0,9.58 2,13.48 6.92,13.48 A 12.09,12.09 0 0 0 697,138.81 V 52.44 Z M 845.64,79 v 82.11 H 821.17 V 80.82 c 0,-8.87 -2.31,-13.3 -7.63,-13.3 -4.26,0 -8.16,2.48 -10.82,7.09 A 35.59,35.59 0 0 1 802.9,79 v 82.11 H 778.43 V 80.82 c 0,-8.87 -2.31,-13.3 -7.63,-13.3 -4.26,0 -8,2.48 -10.64,6.92 v 86.72 H 735.69 V 52.44 H 755 l 2.13,13.83 h 0.35 c 5.5,-10.46 14.37,-16.14 24.83,-16.14 10.29,0 16.14,5.14 18.8,14.37 5.68,-9.4 14.19,-14.37 23.94,-14.37 14.95,0.01 20.59,10.65 20.59,28.87 z\' /%3E%3C/g%3E%3C/g%3E%3C/g%3E%3C/svg%3E%0A";
    const LOGO_SMALL =
      "data:image/svg+xml,%3Csvg xmlns:dc=\'http://purl.org/dc/elements/1.1/\' xmlns:cc=\'http://creativecommons.org/ns%23\' xmlns:rdf=\'http://www.w3.org/1999/02/22-rdf-syntax-ns%23\' xmlns:svg=\'http://www.w3.org/2000/svg\' xmlns=\'http://www.w3.org/2000/svg\' id=\'SVGRoot\' version=\'1.1\' viewBox=\'0 0 846 174\' height=\'24px\' width=\'98px\'%3E%3Cdefs id=\'defs855\'%3E%3Cstyle id=\'style2\' /%3E%3C/defs%3E%3Cmetadata id=\'metadata858\'%3E%3Crdf:RDF%3E%3Ccc:Work rdf:about=\'\'%3E%3Cdc:format%3Eimage/svg+xml%3C/dc:format%3E%3Cdc:type rdf:resource=\'http://purl.org/dc/dcmitype/StillImage\' /%3E%3Cdc:title%3E%3C/dc:title%3E%3C/cc:Work%3E%3C/rdf:RDF%3E%3C/metadata%3E%3Cg id=\'layer1\'%3E%3Cg transform=\'translate(0,0.36)\' data-name=\'Layer 2\' id=\'Layer_2\'%3E%3Cg data-name=\'Layer 1\' id=\'Layer_1-2\'%3E%3Cpath style=\'fill:%23ff0000\' id=\'path6\' d=\'M 242.88,27.11 A 31.07,31.07 0 0 0 220.95,5.18 C 201.6,0 124,0 124,0 124,0 46.46,0 27.11,5.18 A 31.07,31.07 0 0 0 5.18,27.11 C 0,46.46 0,86.82 0,86.82 c 0,0 0,40.36 5.18,59.71 a 31.07,31.07 0 0 0 21.93,21.93 c 19.35,5.18 96.92,5.18 96.92,5.18 0,0 77.57,0 96.92,-5.18 a 31.07,31.07 0 0 0 21.93,-21.93 c 5.18,-19.35 5.18,-59.71 5.18,-59.71 0,0 0,-40.36 -5.18,-59.71 z\' /%3E%3Cpath style=\'fill:%23ffffff\' id=\'path8\' d=\'M 99.22,124.03 163.67,86.82 99.22,49.61 Z\' /%3E%3Cpath style=\'fill:%23ffffff\' id=\'path10\' d=\'m 358.29,55.1 v 6 c 0,30 -13.3,47.53 -42.39,47.53 h -4.43 v 52.5 H 287.71 V 12.36 H 318 c 27.7,0 40.29,11.71 40.29,42.74 z m -25,2.13 c 0,-21.64 -3.9,-26.78 -17.38,-26.78 h -4.43 v 60.48 h 4.08 c 12.77,0 17.74,-9.22 17.74,-29.26 z m 81.22,-6.56 -1.24,28.2 c -10.11,-2.13 -18.45,-0.53 -22.17,6 v 76.26 H 367.52 V 52.44 h 18.8 L 388.45,76 h 0.89 c 2.48,-17.2 10.46,-25.89 20.75,-25.89 a 22.84,22.84 0 0 1 4.42,0.56 z M 441.64,115 v 5.5 c 0,19.16 1.06,25.72 9.22,25.72 7.8,0 9.58,-6 9.75,-18.44 l 21.1,1.24 c 1.6,23.41 -10.64,33.87 -31.39,33.87 -25.18,0 -32.63,-16.49 -32.63,-46.46 v -19 c 0,-31.57 8.34,-47 33.34,-47 25.18,0 31.57,13.12 31.57,45.93 V 115 Z m 0,-22.35 v 7.8 h 17.91 V 92.7 c 0,-20 -1.42,-25.72 -9,-25.72 -7.58,0 -8.91,5.86 -8.91,25.72 z M 604.45,79 v 82.11 H 580 V 80.82 c 0,-8.87 -2.31,-13.3 -7.63,-13.3 -4.26,0 -8.16,2.48 -10.82,7.09 a 35.59,35.59 0 0 1 0.18,4.43 v 82.11 H 537.24 V 80.82 c 0,-8.87 -2.31,-13.3 -7.63,-13.3 -4.26,0 -8,2.48 -10.64,6.92 v 86.72 H 494.5 V 52.44 h 19.33 L 516,66.28 h 0.35 c 5.5,-10.46 14.37,-16.14 24.83,-16.14 10.29,0 16.14,5.14 18.8,14.37 5.68,-9.4 14.19,-14.37 23.94,-14.37 14.86,0 20.53,10.64 20.53,28.86 z m 12.24,-54.4 c 0,-11.71 4.26,-15.07 13.3,-15.07 9.22,0 13.3,3.9 13.3,15.07 0,12.06 -4.08,15.08 -13.3,15.08 -9.04,-0.01 -13.3,-3.02 -13.3,-15.08 z m 1.42,27.84 h 23.41 v 108.72 h -23.41 z m 103.39,0 v 108.72 h -19.15 l -2.13,-13.3 h -0.53 c -5.5,10.64 -13.48,15.07 -23.41,15.07 -14.54,0 -21.11,-9.22 -21.11,-29.26 V 52.44 h 24.47 v 79.81 c 0,9.58 2,13.48 6.92,13.48 A 12.09,12.09 0 0 0 697,138.81 V 52.44 Z M 845.64,79 v 82.11 H 821.17 V 80.82 c 0,-8.87 -2.31,-13.3 -7.63,-13.3 -4.26,0 -8.16,2.48 -10.82,7.09 A 35.59,35.59 0 0 1 802.9,79 v 82.11 H 778.43 V 80.82 c 0,-8.87 -2.31,-13.3 -7.63,-13.3 -4.26,0 -8,2.48 -10.64,6.92 v 86.72 H 735.69 V 52.44 H 755 l 2.13,13.83 h 0.35 c 5.5,-10.46 14.37,-16.14 24.83,-16.14 10.29,0 16.14,5.14 18.8,14.37 5.68,-9.4 14.19,-14.37 23.94,-14.37 14.95,0.01 20.59,10.65 20.59,28.87 z\' /%3E%3C/g%3E%3C/g%3E%3C/g%3E%3C/svg%3E%0A";

    // YouTube: swap the logo images through CSS. Runs at document-start, so
    // <head> may not exist yet; documentElement is always there.
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        #logo-container .logo,
        .footer-logo-icon,
        #logo-icon,
        #logo-icon-container {
          width: 98px !important;
          margin-left: 5px;
          margin-right: 5px;
          content: url("${LOGO_MAIN}") !important;
        }

        html[dark] #logo-icon,
        html[dark] #logo-icon-container {
          width: 98px !important;
          content: url("${LOGO_SMALL}") !important;
        }
      `;
      (doc.head || doc.documentElement).appendChild(style);
    }

    // YouTube Music: the logo is inline SVG, so replace it in the DOM.
    if (!is_music) return;
    const MUSIC_LOGO_SVG =
      '<svg data-vbt-premium-logo="1" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="98.543" height="24" fill="none"><clipPath id="vbt-pl-a"><path d="M0 0h77v26H0Z"/></clipPath><g clip-path="url(#vbt-pl-a)" transform="scale(.92308)"><path fill="#f03" d="M13 26c7.176 0 13-5.824 13-13S20.176 0 13 0 0 5.824 0 13s5.824 13 13 13"/><path stroke="#fff" d="M20.5 13c0 4.144-3.356 7.5-7.5 7.5A7.5 7.5 0 0 1 5.5 13c0-4.144 3.356-7.5 7.5-7.5s7.5 3.356 7.5 7.5z"/><path fill="#fff" d="m17.75 13-7.5-4.25v8.5z"/></g><g style="display:inherit;fill:#fff;fill-opacity:1"><path d="M32.182 2.1v16.8h2.58v-5.99h.69c3.35 0 5.11-1.8 5.11-5.34v-.69c0-3.57-1.56-4.78-4.84-4.78zm5.68 5.53c0 2.37-.72 3.45-2.46 3.45h-.64V3.95h.69c1.97 0 2.41.81 2.41 3.18zM41.982 18.9h2.55v-8.81c.42-.72 1.46-1.04 2.77-.77l.16-2.99c-.17-.02-.32-.04-.46-.04-1.2 0-2.17.91-2.66 2.57h-.18l-.21-2.32h-1.97zM55.746 11.5c0-2.98-.3-5.19-3.73-5.19-3.23 0-3.95 2.15-3.95 5.31v2.17c0 3.08.66 5.32 3.87 5.32 2.54 0 3.85-1.27 3.7-3.73l-2.25-.12c-.03 1.52-.38 2.14-1.39 2.14-1.27 0-1.33-1.21-1.33-3.01v-.84h5.08zm-3.79-3.53c1.22 0 1.31 1.15 1.31 3.1v1.01h-2.6v-1.01c0-1.93.08-3.1 1.29-3.1M60.195 18.9V8.92c.38-.53 1-.85 1.6-.85.77 0 1.05.54 1.05 1.62v9.21h2.66l-.02-9.97c.37-.56 1-.89 1.62-.89.67 0 1.04.57 1.04 1.65v9.21h2.66V9.49c0-2.21-.79-3.22-2.46-3.22-1.16 0-2.15.42-3.06 1.4-.38-.91-1.13-1.4-2.2-1.4-1.21 0-2.35.52-3.15 1.49h-.15l-.19-1.22h-2.05V18.9ZM74.086 4.97c.9 0 1.32-.3 1.32-1.54 0-1.16-.45-1.52-1.32-1.52-.88 0-1.31.32-1.31 1.52 0 1.24.41 1.54 1.31 1.54m-1.22 13.93h2.53V6.54h-2.53zM79.952 19.09c1.46 0 2.37-.61 3.12-1.71h.11l.11 1.52h1.99V6.54h-2.64v9.93c-.28.49-.93.85-1.54.85-.77 0-1.01-.61-1.01-1.63V6.54h-2.63v9.27c0 2.01.58 3.28 2.49 3.28M90.003 18.9V8.92c.38-.53 1-.85 1.6-.85.77 0 1.05.54 1.05 1.62v9.21h2.66l-.02-9.97c.37-.56 1-.89 1.62-.89.67 0 1.04.57 1.04 1.65v9.21h2.66V9.49c0-2.21-.79-3.22-2.46-3.22-1.16 0-2.15.42-3.06 1.4-.38-.91-1.13-1.4-2.2-1.4-1.21 0-2.35.52-3.15 1.49h-.15l-.19-1.22h-2.05V18.9Z" style="fill:#fff;fill-opacity:1" transform="matrix(.92322 0 0 .9259 -1.911 2.734)"/></g></svg>';

    function replace_music_logo() {
      doc.querySelectorAll("ytmusic-logo > a").forEach((el) => {
        if (el.querySelector("svg[data-vbt-premium-logo]")) return;
        el.innerHTML = MUSIC_LOGO_SVG;
      });
    }

    let pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        replace_music_logo();
      }, 50);
    }

    replace_music_logo();
    new MutationObserver(schedule).observe(doc.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  init_old_player_ui();
  init_disable_saturated_hover();
  init_premium_logo();

  init();
  function init() {
    log("Initialization started!" + href, 0);
    url_observer();
    is_account_init = false;
    data_process.set_obj_filter(obj_process_filter);
    config_api.config_init(user_data.language);
    const init_hook = init_hook_collection();
    init_hook.property();
    init_hook.other();
    init_hook.request();

    unsafeWindow.document.addEventListener("DOMContentLoaded", function () {
      set_search_listen();
      on_page_change();
      init_create_button_observer();
      init_quality_preset();
      init_speed_preset();
      darkModeSystem.init();
      darkModeSystem.apply();

      if (document.readyState === "complete") {
        runDeferredInit();
      } else {
        if ("requestIdleCallback" in window) {
          requestIdleCallback(() => runDeferredInit(), { timeout: 5000 });
        } else {
          setTimeout(runDeferredInit, 100);
        }
      }

      function runDeferredInit() {
        init_restore_red_progress_bar();
        init_search_thumbnail_small();
        init_restore_related_sidebar_layout();
        init_disable_ambient_mode();
        init_disable_saturated_hover();
        init_disable_play_on_hover();
        init_return_dislike();
        init_settings_button();
        init_disable_end_cards();
        init_interruptions_remover();
        init_miniplayer_button();
      }

      const hoverToggleListener = (key, _oldValue, newValue) => {
        if (key !== channel_id || !newValue) return;
        user_data = newValue;
        darkModeSystem.apply();
        init_disable_saturated_hover();
        init_disable_play_on_hover();
        init_disable_end_cards();
      };
      GM_addValueChangeListener(channel_id, hoverToggleListener);
    });

    init_global_shorts_blocker();

    isinint = true;
    log("Initialization finished!" + href, 0);
    open_debugger && set_debugger();
  }

  function setSecurePolicy() {
    if (
      !unsafeWindow.isSecureContext ||
      !unsafeWindow.trustedTypes?.createPolicy
    )
      return;
    try {
      unsafeWindow.trustedTypes.createPolicy("default", {
        createScriptURL: (url) => url,
        createHTML: (html) => html,
        createScript: (script) => script,
      });
    } catch (error) {}
  }

  function trustedScriptInit() {
    try {
      let test_value;
      eval("test_eval = 1");
      return function (str) {
        return str;
      };
    } catch (error) {
      if (unsafeWindow.trustedTypes) {
        const policy = unsafeWindow.trustedTypes.createPolicy("eval", {
          createScript: (script) => {
            return script;
          },
        });
        return function (str) {
          return policy.createScript(str);
        };
      } else {
        log("trustedTypes not support", error, -1);
      }
    }
  }

  function init_hook_collection() {
    return {
      property() {
        const already_inject = [];
        let ytInitialPlayerResponse_value =
          unsafeWindow["ytInitialPlayerResponse"];
        function process_property(name, value, rule, reverse = false) {
          if (!value) return value;
          if (already_inject.includes(name)) {
            log(`${name} duplicate modification intercepted`, 0);
            return value;
          }
          const start_time = Date.now();
          if (typeof value === "object") {
            already_inject.push(name);
            open_debugger &&
              !limit_eval &&
              !eval(trustedScript(`debugger_${name}`)) &&
              eval(
                trustedScript(
                  `debugger_${name} = JSON.parse(JSON.stringify(value))`,
                ),
              );
            rule && data_process.obj_process(value, rule, reverse);
          }
          if (typeof value === "string") {
            already_inject.push(name);
            open_debugger &&
              !limit_eval &&
              !eval(trustedScript(`debugger_${name}`)) &&
              eval(trustedScript(`debugger_${name} = JSON.parse(value)`));
            value = data_process.text_process(value, rule, "insert", reverse);
          }
          log(`${name} time:`, Date.now() - start_time, "spend_time");
          return value;
        }

        define_property_hook(unsafeWindow, "ytInitialPlayerResponse", {
          get: function () {
            return ytInitialPlayerResponse_value;
          },
          set: function (value) {
            inject_info.ytInitialPlayerResponse = true;
            value = process_property(
              "ytInitialPlayerResponse",
              value,
              config_api.common_ytInitialPlayerResponse_rule,
            );
            ytInitialPlayerResponse_value = value;
          },
          configurable: false,
        });
        let ytInitialReelWatchSequenceResponse_value =
          unsafeWindow["ytInitialReelWatchSequenceResponse"];
        define_property_hook(
          unsafeWindow,
          "ytInitialReelWatchSequenceResponse",
          {
            get: function () {
              return ytInitialReelWatchSequenceResponse_value;
            },
            set: function (value) {
              inject_info.ytInitialReelWatchSequenceResponse = true;
              if (["yt_shorts", "mobile_yt_shorts"].includes(page_type)) {
                value = process_property(
                  "ytInitialReelWatchSequenceResponse",
                  value,
                  config_api.get_rules(
                    mobile_web ? "yt_shorts_mobile" : "yt_shorts",
                  ).ytInitialReelWatchSequenceResponse_rule,
                );
              }
              ytInitialReelWatchSequenceResponse_value = value;
            },
            configurable: false,
          },
        );

        let ytInitialData_value = unsafeWindow["ytInitialData"];
        define_property_hook(unsafeWindow, "ytInitialData", {
          get: function () {
            return ytInitialData_value;
          },
          set: function (value) {
            inject_info.ytInitialData = true;
            let rules = config_api.get_rules(page_type);
            ![
              "yt_watch",
              "mobile_yt_watch",
              "mobile_yt_watch_searching",
            ].includes(page_type) && (rules = rules.ytInitialData_rule);
            value = process_property("ytInitialData", value, rules);
            value = restore_sidebar_layout_on_ytInitialData(value);
            ytInitialData_value = value;
          },
          configurable: false,
        });

        const origin_ua = navigator.userAgent;
        define_property_hook(navigator, "userAgent", {
          get: function () {
            return browser_info.isMobile || browser_info.name === "Chrome"
              ? origin_ua
              : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
          },
        });
        if (unsafeWindow.ytcfg) {
          if (
            unsafeWindow.ytcfg.data_ &&
            typeof unsafeWindow.ytcfg.data_.LOGGED_IN === "boolean"
          ) {
            account_data_init(unsafeWindow.ytcfg.data_.LOGGED_IN);
          } else {
            if (
              unsafeWindow.ytcfg.data_ &&
              typeof unsafeWindow.ytcfg.data_ === "object"
            ) {
              define_property_hook(unsafeWindow.ytcfg.data_, "LOGGED_IN", {
                get: function () {
                  return unsafeWindow.ytcfg.data_.LOGGED_IN_;
                },
                set: function (value) {
                  unsafeWindow.ytcfg.data_.LOGGED_IN_ = value;
                  account_data_init(value);
                },
              });
            }
          }
          if (!unsafeWindow.ytcfg.data_) {
            if (unsafeWindow.yt?.config_) {
              const config_ = unsafeWindow.yt.config_;
              if (typeof config_.LOGGED_IN === "boolean") {
                account_data_init(config_.LOGGED_IN);
              }
              config_.HL && config_api.config_init(config_.HL);
            }
          } else {
            if (unsafeWindow.ytcfg.data_?.HL) {
              config_api.config_init(unsafeWindow.ytcfg.data_.HL);
            } else {
              if (unsafeWindow.ytcfg.msgs) {
                unsafeWindow.ytcfg.msgs.__lang__ &&
                  config_api.config_init(unsafeWindow.ytcfg.msgs.__lang__);
              } else {
                unsafeWindow.ytcfg._msgs = unsafeWindow.ytcfg.msgs;
                define_property_hook(unsafeWindow.ytcfg, "msgs", {
                  get: function () {
                    return this._msgs;
                  },
                  set: function (newValue) {
                    if (newValue.__lang__)
                      config_api.config_init(newValue.__lang__);
                    this._msgs = newValue;
                  },
                });
              }
            }
          }
        } else {
          define_property_hook(unsafeWindow, "ytcfg", {
            get: function () {
              return this._ytcfg;
            },
            set: function (newValue) {
              if (newValue === unsafeWindow.ytcfg) return;
              if (newValue.set) {
                const origin_set = newValue.set;
                newValue.set = function () {
                  if (arguments?.[0].YTMUSIC_INITIAL_DATA) {
                    const yt_music_init_data =
                      arguments[0].YTMUSIC_INITIAL_DATA;
                    if (yt_music_init_data?.length > 0) {
                      const browse_data = yt_music_init_data[1];
                      if (browse_data.path === "/browse") {
                        const rule =
                          config_api.get_rules("yt_music").ytInitialData_rule;
                        browse_data.data = process_property(
                          "music_initialData",
                          browse_data.data,
                          rule,
                        );
                      }
                    }
                  }
                  origin_set.apply(this, arguments);
                  if (
                    arguments[0] &&
                    typeof arguments[0].LOGGED_IN === "boolean"
                  ) {
                    account_data_init(arguments[0].LOGGED_IN);
                  }
                  if (arguments[0].HL) {
                    config_api.config_init(arguments[0].HL);
                  }
                };
              }
              this._ytcfg = newValue;
            },
          });
        }
      },
      other() {
        const origin_createElement = unsafeWindow.document.createElement;
        unsafeWindow.document.createElement = function () {
          const node = origin_createElement.apply(this, arguments);
          if (arguments[0] === "IFRAME") {
            const contentWindow_getter = Object.getOwnPropertyDescriptor(
              HTMLIFrameElement.prototype,
              "contentWindow",
            ).get;
            define_property_hook(node, "contentWindow", {
              get: function () {
                const contentWindow = contentWindow_getter.call(node);
                if (
                  !contentWindow ||
                  this.src !== "about:blank" ||
                  contentWindow.change_history
                )
                  return contentWindow;
                set_history_hook(contentWindow);
                contentWindow.fetch = fake_fetch;
                contentWindow.change_history = true;
                return contentWindow;
              },
            });
          }
          return node;
        };
        unsafeWindow.document.createElement.toString =
          origin_createElement.toString.bind(origin_createElement);
      },
            request() {
                async function deal_response(name, response, rule) {
                    if (!rule) return response;
                    let is_deal = false;
                    const responseClone = response.clone();
                    let result = await responseClone.text();
                    let origin_result = result;
                    if (name === 'subscribe' || name === 'unsubscribe') {
                        let match_list = result.match(/channelId":\"(.*?)"/);
                        const match_channel_id = match_list && match_list.length > 1 ? match_list[1] : '';
                        let channel_infos = user_data.channel_infos;
                        if (match_channel_id) {
                            if (name === 'unsubscribe') {
                                let index = channel_infos.ids.indexOf(match_channel_id);
                                if (index > -1) {
                                    channel_infos.ids.splice(index, 1);
                                    channel_infos.names.splice(index, 1);
                                }
                            } else {
                                channel_infos.ids.push(match_channel_id);
                                channel_infos.names.push('');
                            }
                            user_data.channel_infos = channel_infos;
                            user_data_api.set();
                            log(name, match_channel_id, 0);
                        }
                        is_deal = true;
                    }
                    if (name === 'playlist') {
                        let obj;
                        try {
                            obj = JSON.parse(result);
                            data_process.obj_process(obj.playerResponse, config_api.common_ytInitialPlayerResponse_rule, false);
                            data_process.obj_process(obj.response, config_api.get_rules('yt_watch', 'init'), false);
                            result = JSON.stringify(obj);
                        } catch (error) {
                            log('playlist 解析失败', error, -1);
                            result = origin_result;
                        }
                        is_deal = true;
                    }
                    if (!is_deal) {
                        let start_time = Date.now();
                        result = data_process.text_process(result, rule, 'insert', false);
                        log(name + ' 时间：', Date.now() - start_time, 'spend_time');
                    }
                    if (!result) {
                        result = origin_result;
                        debugger;
                    }
                    return new Response(result, response);
                }
                const origin_fetch = unsafeWindow.fetch;
                if (!check_native('fetch', origin_fetch)) {
                    log('fetch have been modified', -1);
                }
                fake_fetch = function () {
                    const fetch_ = async function (uri, options) {
                        async function fetch_request(response) {
                            let url = response.url;
                            inject_info.fetch = true;
                            let request_body;
                            try {
                                request_body = uri.body_ ? JSON.parse(uri.body_) : null;
                            } catch (error) {
                                request_body = null;
                            }
                            if (url.includes('youtubei/v1/next')) {
                                const rule = config_api.get_rules(mobile_web ? 'mobile_yt_watch' : 'yt_watch', request_body?.videoId ? "init" : 'next');
                                return await deal_response('next', response, rule);
                            }
                            if (url.includes('youtubei/v1/player')) {
                                return await deal_response('player', response, config_api.common_ytInitialPlayerResponse_rule);
                            }
                            if (url.includes('youtubei/v1/reel/reel_watch_sequence')) {
                                const rule = config_api.get_rules(mobile_web ? 'mobile_yt_shorts' : 'yt_shorts').ytInitialReelWatchSequenceResponse_rule;
                                return await deal_response('reel_watch_sequence', response, rule);
                            }
                            if (url.includes('youtubei/v1/reel/reel_item_watch')) {
                                // shorts 内容
                                const rule = config_api.get_rules(mobile_web ? 'mobile_yt_shorts' : 'yt_shorts').ytInitialData_rule;
                                return await deal_response('reel_item_watch', response, rule);
                            }
                            if (url.includes('youtubei/v1/browse?prettyPrint=false')) {
                                let browse_id = request_body?.browseId;
                                let rule;
                                if (href.includes('https://music.youtube.com/')) {
                                    rule = config_api.get_rules('yt_music', 'browse').ytInitialData_rule;
                                }
                                // 忽略音乐主页 影视主页
                                if (!rule && (['yt_home', 'mobile_yt_home'].includes(page_type) || browse_id === 'FEwhat_to_watch')) {
                                    if (!browse_id) {
                                        let node, category_text, node_list, node_index;
                                        if (mobile_web) {
                                            node = $('#filter-chip-bar > div > ytm-chip-cloud-chip-renderer.selected');
                                            node_list = $$('#filter-chip-bar > div > ytm-chip-cloud-chip-renderer');
                                            node_index = Array.from(node_list).indexOf(node);
                                            if (node_index !== 1) return response;
                                        } else {
                                            node = $('#chips > yt-chip-cloud-chip-renderer.style-scope.ytd-feed-filter-chip-bar-renderer.iron-selected');
                                            node_list = $$('#chips > yt-chip-cloud-chip-renderer.style-scope.ytd-feed-filter-chip-bar-renderer');
                                            node_index = Array.from(node_list).indexOf(node);
                                            if (node_index !== 0) return response;
                                        }

                                    }
                                    rule = config_api.get_rules(mobile_web ? 'mobile_yt_home' : 'yt_home', request_body?.browseId ? 'init' : 'browse').ytInitialData_rule;
                                }

                                return await deal_response('browse', response, rule);
                            }
                            if (url.startsWith('https://www.youtube.com/playlist?list=')) {
                                return await deal_response('playlist', response, []);
                            }
                            // if (url.includes('https://m.youtube.com/youtubei/v1/guide')) {
                            //     return response;
                            // }
                            if (url.includes('/youtubei/v1/search')) {
                                const rule = config_api.get_rules(mobile_web ? 'mobile_yt_search' : 'yt_search').ytInitialData_rule;
                                return await deal_response('search', response, rule);
                            }
                            if (url.includes('/unsubscribe?prettyPrint=false')) {
                                return await deal_response('unsubscribe', response, []);
                            }
                            if (url.includes('/subscribe?prettyPrint=false')) {
                                return await deal_response('subscribe', response, []);
                            }
                            if (url.includes('/v1/get_watch')) {
                                const originalBody = response.body;
                                const reader = originalBody.getReader();
                                const stream = new ReadableStream({
                                    async start(controller) {
                                        const chunks = [];
                                        try {
                                            // Read all the data first
                                            while (true) {
                                                const { done, value } = await reader.read();
                                                if (done) break;
                                                chunks.push(value);
                                            }
                                            // Merge all the chunks
                                            const allChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
                                            let position = 0;
                                            for (const chunk of chunks) {
                                                allChunks.set(chunk, position);
                                                position += chunk.length;
                                            }
                                            // Convert to text
                                            let text = new TextDecoder().decode(allChunks);
                                            const save = text;
                                            try {
                                                let json = JSON.parse(text);
                                                const rules = [
                                                    "abs:[0].playerResponse.adBreakHeartbeatParams=- $exist",
                                                    "abs:[0].playerResponse.adSlots=- $exist",
                                                    "abs:[0].playerResponse.adPlacements=- $exist",
                                                    "adSlotRenderer.=- $exist",
                                                    "merchandiseShelfRenderer.=- $exist"
                                                ];
                                                const traverse_all = true;
                                                data_process.obj_process(json, rules, { traverse_all });
                                                text = JSON.stringify(json);
                                            } catch (error) {
                                                log('fetch response text error', error, -1);
                                                text = save;
                                            }
                                            // Convert the modified text back to a Uint8Array and return it.
                                            const modifiedData = new TextEncoder().encode(text);
                                            controller.enqueue(modifiedData);
                                            controller.close();
                                        } catch (error) {
                                            log('Stream error: ' + error, -1);
                                            controller.error(error);
                                        }
                                    }
                                });
                                // Fix: Create a new Response object to prevent exceptions caused by underlying stream conflicts.
                                                const newResponse = new Response(stream, {
                                                status: response.status,
                                                statusText: response.statusText,
                                                headers: response.headers
                                            });
                                                // Must include the original url property
                                                Object.defineProperty(newResponse, 'url', { value: response.url });
                                                return newResponse;
                            }

                            return response;
                        }
                        return origin_fetch(uri, options).then(fetch_request);
                    };
                    return fetch_;
                }();
                unsafeWindow.fetch = fake_fetch;
                unsafeWindow.fetch.toString = origin_fetch.toString.bind(origin_fetch);
                const origin_Request = unsafeWindow.Request;
                if (!check_native('Request', origin_Request)) {
                    log('Request have been modified', -1);
                }
                unsafeWindow.Request = class extends unsafeWindow.Request {
                    constructor(input, options = void 0) {
                        super(input, options);
                        this.url_ = input;
                        if (options && 'body' in options) {
                            setTimeout(async () => {
                                const ds = new DecompressionStream('gzip');
                                const stream = new Blob([options.body]).stream().pipeThrough(ds);
                                const requestBody = await new Response(stream).text();
                                this.body_ = requestBody;
                            }, 0);
                        }

                    }
                };

                unsafeWindow.XMLHttpRequest = class extends unsafeWindow.XMLHttpRequest {
                    open(method, url, ...opts) {
                        inject_info.xhr = true;
                        if (['mobile_yt_watch'].includes(page_type) && url.includes('m.youtube.com/watch?v')) {
                            log('xhr watch 返回空', 0);
                            return null;
                        }
                        if (['mobile_yt_home'].includes(page_type) && url.includes('m.youtube.com/?pbj')) {
                            log('xhr home 返回空', 0);
                            return null;
                        }
                        this.url_ = url;
                        return super.open(method, url, ...opts);
                    }
                    send(body) {
                        this.body_ = body;
                        super.send(body);
                    }
                    get xhrResponseValue() {
                        const xhr = this;
                        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
                            let result = super.response;
                            const url = xhr.responseURL;
                            const result_type = typeof result;
                            try {
                                if (url.includes('youtubei/v1/player')) {
                                    // music_watch shorts
                                    if (result_type !== 'string') {
                                        log(`XHR ${url} 返回值不是字符串！`, 0);
                                        return result;
                                    };
                                    result = data_process.text_process(result, config_api.common_ytInitialPlayerResponse_rule, 'insert', false);
                                    return result;
                                }
                                if (url.includes('youtube.com/playlist')) {
                                    debugger;
                                    let obj;
                                    obj = JSON.parse(result);
                                    log(`出现 ${url} ！`, 0);
                                    data_process.obj_process(obj[2].playerResponse, ytInitialPlayerResponse_rule, false);
                                    data_process.obj_process(obj[3].response, ytInitialData_rule, false);
                                    tmp_debugger_value = obj;
                                    result = JSON.stringify(obj);
                                    return result;
                                }
                            } catch (error) {
                                log(`XHR ${url} 解析失败！`, error, -1);
                            }
                        }
                        return super.response;
                    }
                    get responseText() {
                        return this.xhrResponseValue;
                    }
                    get response() {
                        return this.xhrResponseValue;
                    }
                };

            }
    };
  }

  function on_page_change() {
    selectorCache.invalidateAll();
    observerManager.disconnectAll();

    // Cleanup duplicate song prevention when leaving YT Music
    if (!["yt_music_home", "yt_music_watch"].includes(page_type)) {
      cleanup_duplicate_song_prevention();
    }

    function common() {
      if (page_type === "yt_shorts") {
        shorts_fun.check_shorts_exist();
      }
    }

    function element_monitor() {
      const configs = wait_configs[page_type] || [];
      if (configs.length === 0) return;

      const debouncedCallback = debounce(function (mutationsList) {
        for (let i = configs.length - 1; i >= 0; i--) {
          const config = configs[i];
          const selector = config.seletor;
          const nodes = $$(selector);
          for (let node of nodes) {
            if (node.offsetHeight > 0) {
              if (config.inject) {
                if (!node.inject_xxxx) {
                  node.inject_xxxx = true;
                } else {
                  configs.splice(i, 1);
                  break;
                }
              }
              if ("count" in config) {
                if (config.count > 0) {
                  config.count--;
                  if (config.count === 0) {
                    configs.splice(i, 1);
                  }
                }
              }
              const funs = Array.isArray(config.fun)
                ? config.fun
                : [config.fun];
              for (let fun of funs) {
                fun(node);
              }
              break;
            }
          }
        }
        if (configs.length === 0) {
          log("monitor end", 0);
          observerManager.removeObserver("element_monitor");
          return;
        }
      }, 100);

      const observer = new MutationObserver(debouncedCallback);
      observer.observe($("body"), {
        childList: true,
        subtree: true,
      });
      observerManager.addObserver("element_monitor", observer);
    }

    const wait_configs = {
      yt_shorts: [
        {
          seletor: "ytd-reel-video-renderer[is-active] video",
          inject: true,
          fun: [
            shorts_auto_scroll,
            set_shorts_dbclick_like,
            set_shorts_progress,
          ],
        },
        {
          seletor: "ytd-reel-video-renderer[is-active] #comments-button",
          inject: true,
          fun: [shorts_change_comment_click],
        },
        {
          seletor: "ytd-reel-video-renderer[is-active] video",
          count: 30,
          fun: [],
        },
      ],
      mobile_yt_shorts: [
        {
          seletor:
            'div.carousel-item[aria-hidden="false"] ytm-like-button-renderer',
          count: 10,
          fun: [
            shorts_auto_scroll,
            set_shorts_dbclick_like,
            set_shorts_progress,
          ],
        },
      ],

      yt_home: [
        {
          seletor: ".ytdChipsShelfWithVideoShelfRendererHost",
          inject: true,
          fun: hide_explore_more_topics_section,
        },
      ],

      yt_watch: [
        {
          seletor: ".ytdChipsShelfWithVideoShelfRendererHost",
          inject: true,
          fun: hide_explore_more_topics_section,
        },
        {
          seletor: "#teaser-carousel",
          inject: true,
          fun: hide_teaser_carousel,
        },
      ],
    };

    common();
    hide_create_button();
    element_monitor();

    init_sponsorblock();
    init_duplicate_song_prevention();
    init_quality_preset();
    init_speed_preset();

    apply_hide_buttons_css();
    init_restore_related_sidebar_layout();

    hide_shorts_sections_if_disabled();

    function set_dbclick(node, handler) {
      if (node.inject_dbclick) return;
      node.inject_dbclick = true;
      let corgin_onclick = node.onclick;
      let timers = [];
      node.onclick = node.onclick_ = function (event) {
        if (
          node.dbclick_intercept_propagation ||
          node.click_intercept_propagation
        ) {
          event.stopPropagation();
        }
        const timer = setTimeout(() => {
          if (
            node.dbclick_intercept_propagation &&
            !node.click_intercept_propagation
          ) {
            let parent = node.parentElement;
            if (parent) {
              let parentHandler = parent.onclick;
              if (typeof parentHandler === "function") {
                parentHandler.call(parent, event);
              }
              parent.dispatchEvent(event);
            }
          }
          timers.splice(timers.indexOf(timer), 1);
          corgin_onclick?.call(this, event);
        }, 300);
        timers.push(timer);
      };
      define_property_hook(node, "onclick", {
        get: function () {
          return this.onclick_;
        },
        set: function (fun) {
          corgin_onclick = fun;
        },
      });
      node.addEventListener("dblclick", function (event) {
        if (node.dbclick_intercept_propagation) event.stopPropagation();
        for (let timer of timers) {
          clearInterval(timer);
        }
        timers.length = 0;
        handler?.call(this, event);
      });
    }
    function set_shorts_dbclick_like(video_node) {
      video_node =
        page_type === "yt_shorts"
          ? video_node
          : $('div.carousel-item[aria-hidden="false"] div.video-wrapper');
      if (!video_node) return;
      video_node.dbclick_intercept_propagation = true;
      set_dbclick(video_node, function () {
        if (user_data.shorts_dbclick_like === "off") return;
        const like_seltor =
          page_type === "yt_shorts"
            ? "ytd-reel-video-renderer[is-active] #like-button > yt-button-shape > label > button"
            : 'div.carousel-item[aria-hidden="false"] ytm-like-button-renderer button';
        $(like_seltor)?.click();
      });
    }
    function set_shorts_progress(node) {
      const video_node = page_type === "yt_shorts" ? node : $("video");
      if (!video_node || video_node.inject_shorts_progress) return;
      video_node.inject_shorts_progress = true;
      observerManager.addListener(video_node, "timeupdate", function () {
        if (user_data.shorts_add_video_progress === "off") return;
        const shape_button =
          page_type === "yt_shorts"
            ? $("ytd-reel-video-renderer[is-active] #button-shape > button")
            : $(
                'div.carousel-item[aria-hidden="false"] ytm-bottom-sheet-renderer button',
              );
        if (!shape_button) return;
        const progress = (video_node.currentTime / video_node.duration) * 100;
        const transparency = page_type === "yt_shorts" ? "0.05" : "0.3";
        const progress_color =
          page_type === "yt_shorts"
            ? "rgba(0, 0, 255, 0.4)"
            : "rgba(255, 255, 0, 0.4)";
        shape_button.style.background = `linear-gradient(to top, ${progress_color} ${progress}%, rgba(0, 0, 0, ${transparency}) ${progress}%)`;
      });
    }
    function shorts_change_comment_click(comments_node) {
      const comments_button = comments_node.querySelector(
        "ytd-button-renderer > yt-button-shape > label > button",
      );
      const onclick_setter = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "onclick",
      ).set;
      const current_render_node = $("ytd-reel-video-renderer[is-active]");
      const wrap = function (fun) {
        return function (event) {
          const expand_node = current_render_node.querySelector(
            "#watch-while-engagement-panel > ytd-engagement-panel-section-list-renderer:nth-child(1)",
          );
          if (
            expand_node?.visibility === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"
          ) {
            const expand_close_node = current_render_node.querySelector(
              "#visibility-button > ytd-button-renderer > yt-button-shape > button",
            );
            expand_close_node?.click();
          } else {
            fun.call(this, event);
          }
        };
      };
      comments_button.onclick = comments_button.onclick_ = wrap(
        comments_button.onclick,
      );
      define_property_hook(comments_button, "onclick", {
        get: function () {
          return this.onclick_;
        },
        set: function (fun) {
          this.onclick_ = wrap(fun);
          onclick_setter.call(comments_button, this.onclick_);
        },
      });
    }
    function shorts_auto_scroll(video_node) {
      video_node = page_type === "yt_shorts" ? video_node : $("video");
      if (!video_node) return;
      if (video_node?.inject_auto_scroll) return;
      video_node.inject_auto_scroll = true;
      video_node.loop = false;
      define_property_hook(video_node, "loop", {
        get: function () {
          return false;
        },
      });
      observerManager.addListener(video_node, "ended", function () {
        if (user_data.shorts_auto_scroll === "on") {
          if (page_type === "yt_shorts") {
            $(
              "#navigation-button-down > ytd-button-renderer > yt-button-shape > button",
            ).click();
          } else {
            simulate_swipeup(this, 500, 100);
          }
          return;
        }
        if (user_data.shorts_disable_loop_play === "on") {
          return;
        }
        this.play();
      });
    }
  }

  function get_user_data_listener() {
    return {
      cur_channel_id: null,
      listener_id: null,
      set: function () {
        if (channel_id === this.cur_channel_id) {
          return;
        }
        !this.cur_channel_id && GM_removeValueChangeListener(this.listener_id);
        this.cur_channel_id = channel_id;
        this.listener_id = GM_addValueChangeListener(
          channel_id,
          (name, oldValue, newValue, remote) => {
            if (!remote || this.cur_channel_id !== name) return;
            newValue.language = "en";
            user_data = newValue;
            config_api.config_init();
          },
        );
      },
    };
  }

  async function account_data_init(login) {
    if (is_account_init) return;
    is_account_init = true;
    if (login) {
      yt_api.get_channel_id();
      yt_api.get_subscribe_data();
    } else if (channel_id !== "default") {
      channel_id = "default";
      user_data.login = false;
      user_data = user_data_api.get();
    }
  }

  function native_method_hook(method_path, handler) {
    try {
      let [last_path, last_key] =
        data_process.get_lastPath_and_key(method_path);
      let last_obj = data_process.string_to_value(
        unsafeWindow,
        "unsafeWindow." + last_path,
      );
      let dec_obj = last_obj[last_key];
      last_obj[last_key + "__"] = dec_obj;
      if (typeof dec_obj !== "function") {
        log(method_path, "have been modified", -1);
        return;
      }
      const method_name = dec_obj.name;
      if (
        dec_obj.toString() !==
        "function " + method_name + "() { [native code] }"
      ) {
        log(method_path, "have been modified!", -1);
      }
      last_obj[last_key] = handler;
    } catch (error) {
      log(method_path, "hook failed!", error, -1);
    }
  }

  function define_property_hook(obj, property, descriptor) {
    const old_descriptor = Object.getOwnPropertyDescriptor(obj, property);
    if (old_descriptor?.configurable === false) {
      debugger;
      log(property, "is not configurable, hook error!", old_descriptor, -1);
      return;
    }
    try {
      Object.defineProperty(obj, property, descriptor);
    } catch (error) {
      log(property, "hook failed!", error, -1);
    }
  }

  function get_config_api() {
    return {
      flag_infos: {
        en: {
          sponsored: "Sponsored Ads",
          free_movie: "Free (with ads)",
          live: "LIVE",
          movie_channel: "Movies & TV",
          Playables: "Playables",
          short_buy_super_thanks: "Buy Super Thanks",
          think_video:
            "What did you think of this video? | How is this recommended content?",
          try: "Try",
          recommend_popular: "Trending",
          featured: "Featured",
          category_live: "Live",
          category_game: "Gaming",
          category_news: "News",
          btn_recommend_movie: "Movie Recommendations",
          btn_recommend_shorts: "Shorts Recommendations",
          btn_recommend_liveroom: "Live Recommendations",
          btn_recommend_popular: "Trending",
          btn_recommend_game: "Playables Recommendations",
          btn_save: "Save",
          goodselect: "Featured",
          music_ad_flag: "ad-free",
          upcoming: "UPCOMING",
          init: "Initialize",
          ctoc: "Copied to clipboard",
          runing_normally: "running normally",
          err_msg: "error message",
          success: "Success",
          failed: "Failed",
          tips: "You can send an error message or screenshot to the developer",
          exists_error:
            "Error message exists (It is recommended to refresh multiple times to see if it is the same error message)",
          inject: "Inject",
          btn_lable_open: "On",
          btn_lable_close: "Off",
          btn_lable_subscribed: "Only subscribed",
          recommend_subscribed_lable_tips:
            "Only show subscribed recommendations",
          title_add_shorts_upload_date: "Add Shorts upload time",
          title_shorts_change_author_name:
            "Change Shorts username to channel name",
          config_info: "Config info",
          page_info: "Page info",
          rule_info: "Rule info",
          del_config_confirm_tips:
            "Are you sure you want to delete all configuration settings?",
          btn_shorts_auto_scroll_title: "AutoScroll",
          bt_shorts_disable_loop_play_title: "DisableLoopPlay",
          btn_shorts_dbclick_like_title: "DoubleClickLikeVideo",
          btn_shorts_add_video_progress_title: "AddVideoProgress",
          shorts_recommend_split_tag: "ShortsConfig",
          btn_sponsorblock_title: "SponsorBlock skip sponsors",
          btn_sponsorblock_tips:
            "Automatically skip sponsor segments using SponsorBlock API",
          btn_duplicate_song_prevention_title: "Prevent Duplicate Songs",
          btn_duplicate_song_prevention_tips:
            "Prevent the same song or artist from playing consecutively",
        },
      },

      common_ytInitialPlayerResponse_rule: [
        "abs:playerAds=- $exist",
        "abs:adSlots=- $exist",
        "abs:adPlacements=- $exist",
        'abs:auxiliaryUi.messageRenderers.bkaEnforcementMessageViewModel.isVisible=json("true") $exist',
        "abs:adBreakHeartbeatParams=- $exist",
        "abs:messages[*]=- /.mealbarPromoRenderer$exist",
      ],
      default_language: "en",
      config_init: function (tmp_language = null) {
        // Always use English
        user_data.language = "en";
        user_data_api.set();
        flag_info = this.flag_infos["en"];
        movie_channel_info = {
          guideEntryRenderer: {
            navigationEndpoint: {
              clickTrackingParams: "CBQQnOQDGAIiEwj5l8SLqPiCAxUXSEwIHbf1Dw0=",
              commandMetadata: {
                webCommandMetadata: {
                  url: "/feed/storefront",
                  webPageType: "WEB_PAGE_TYPE_BROWSE",
                  rootVe: 6827,
                  apiUrl: "/youtubei/v1/browse",
                },
              },
              browseEndpoint: {
                browseId: "FEstorefront",
              },
            },
            icon: {
              iconType: "CLAPPERBOARD",
            },
            trackingParams: "CBQQnOQDGAIiEwj5l8SLqPiCAxUXSEwIHbf1Dw0=",
            formattedTitle: {
              simpleText: flag_info.movie_channel,
            },
            accessibility: {
              accessibilityData: {
                label: flag_info.movie_channel,
              },
            },
          },
        };
        data_process.storage_obj("movie_channel_info", movie_channel_info);
        mobile_movie_channel_info = {
          navigationItemViewModel: {
            text: {
              content: flag_info.movie_channel,
            },
            icon: {
              sources: [
                {
                  clientResource: {
                    imageName: "CLAPPERBOARD",
                  },
                },
              ],
            },
            onTap: {
              parallelCommand: {
                commands: [
                  {
                    innertubeCommand: {
                      clickTrackingParams:
                        "CBQQnOQDGAIiEwj5l8SLqPiCAxUXSEwIHbf1Dw0=",
                      hideMoreDrawerCommand: {},
                    },
                  },
                  {
                    innertubeCommand: {
                      clickTrackingParams:
                        "CBQQnOQDGAIiEwj5l8SLqPiCAxUXSEwIHbf1Dw0=",
                      commandMetadata: {
                        webCommandMetadata: {
                          url: "/feed/storefront",
                          webPageType: "WEB_PAGE_TYPE_CHANNEL",
                          rootVe: 3611,
                          apiUrl: "/youtubei/v1/browse",
                        },
                      },
                      browseEndpoint: {
                        browseId: "FEstorefront",
                      },
                    },
                  },
                ],
              },
            },
            loggingDirectives: {
              trackingParams: "CBQQnOQDGAIiEwj5l8SLqPiCAxUXSEwIHbf1Dw0=",
              visibility: {
                types: "12",
              },
              enableDisplayloggerExperiment: true,
            },
          },
        };
        data_process.storage_obj(
          "mobile_movie_channel_info",
          mobile_movie_channel_info,
        );
        ytInitialData_rule = null;
        ytInitialReelWatchSequenceResponse_rule = null;
        ytInitialPlayerResponse_rule = null;
        mobile_web = page_type.startsWith("mobile");
      },
      get_rules: function (page_type_, type) {
        page_type_ = page_type_ || page_type;
        if (page_type_ === "mobile_yt_watch_searching")
          page_type_ = "mobile_yt_watch";
        else if (page_type_ === "mobile_yt_home_searching")
          page_type_ = "mobile_yt_home";
        else if (page_type_ === "yt_music_channel") page_type_ = "yt_watch";

        let tmp_ytInitialData_rule = null;
        let tmp_ytInitialReelWatchSequenceResponse_rule = null;
        let tmp_ytInitialPlayerResponse_rule = null;
        const common_ytInitialData_rule = ["adSlotRenderer.=-"];
        const return_obj = {
          ytInitialData_rule: null,
          ytInitialReelWatchSequenceResponse_rule: null,
          ytInitialPlayerResponse_rule: null,
          reverse: false,
        };
        if (page_type_ === "yt_search") {
          tmp_ytInitialData_rule = [
            ...common_ytInitialData_rule,
            "abs:contents[*][*].videoRenderer=- /.isAd",
            "abs:contents[*][*].gridVideoRenderer=- /.isAd",
            "abs:contents[*][*].videoWithContextRenderer=- /.isAd",
            "abs:results[*].videoRenderer=- /.isAd",
            "abs:results[*].gridVideoRenderer=- /.isAd",
          ];
          return_obj.ytInitialData_rule = tmp_ytInitialData_rule;
          return return_obj;
        }

        if (page_type_ === "yt_music") {
          return_obj.ytInitialData_rule = [
            "abs:overlay.mealbarPromoRenderer=- $exist",
          ];
          return return_obj;
        }

        if (page_type_ === "mobile_yt_search") {
          tmp_ytInitialData_rule = [
            ...common_ytInitialData_rule,
            "abs:contents[*][*].videoRenderer=- /.isAd",
            "abs:contents[*][*].gridVideoRenderer=- /.isAd",
            "abs:contents[*][*].videoWithContextRenderer=- /.isAd",
            "abs:results[*].videoRenderer=- /.isAd",
            "abs:results[*].gridVideoRenderer=- /.isAd",
          ];
          return_obj.ytInitialData_rule = tmp_ytInitialData_rule;
          return return_obj;
        }

        if (page_type_ === "yt_kids_watch") {
          tmp_ytInitialData_rule = common_ytInitialData_rule;
          return_obj.ytInitialData_rule = tmp_ytInitialData_rule;
          return return_obj;
        }

        if (page_type_ === "yt_music_watch") {
          tmp_ytInitialData_rule = common_ytInitialData_rule;
          return_obj.ytInitialData_rule = tmp_ytInitialData_rule;
          return return_obj;
        }

        if (page_type_.includes("yt_shorts")) {
          const tmp_ytInitialData_rule__ = [];
          if (
            user_data.add_shorts_upload_date === "on" ||
            user_data.shorts_change_author_name === "on"
          ) {
            let dec_path =
              "overlay.reelPlayerOverlayRenderer.reelPlayerHeaderSupportedRenderers.reelPlayerHeaderRenderer.channelTitleText.runs[0].text";
            let name_base_path =
              "json_obj.engagementPanels[1].engagementPanelSectionListRenderer.content.structuredDescriptionContentRenderer.items[0].videoDescriptionHeaderRenderer.channel.";
            let time_tag_path;
            let name_tag_path;
            if (mobile_web) {
              user_data.add_shorts_upload_date === "on" &&
                (time_tag_path = "....timestampText.runs[0].text");
              user_data.shorts_change_author_name === "on" &&
                (name_tag_path = name_base_path + "runs[0].text");
            } else {
              user_data.add_shorts_upload_date === "on" &&
                (time_tag_path = "....timestampText.simpleText");
              user_data.shorts_change_author_name === "on" &&
                (name_tag_path = name_base_path + "simpleText");
            }
            let rule = `abs:${dec_path}={absObj(${
              name_tag_path ? name_tag_path : "json_obj." + dec_path
            })\}${time_tag_path ? "\n{pathObj(" + time_tag_path + ")}" : ""}`;
            tmp_ytInitialData_rule__.push(rule);
          }

          if (user_data.short_buy_super_thanks === "off") {
            !mobile_web &&
              tmp_ytInitialData_rule__.push(
                "abs:overlay.reelPlayerOverlayRenderer.suggestedAction=- $exist",
              );
          }
          tmp_ytInitialReelWatchSequenceResponse_rule = [
            "abs:entries[*]=- /.command.reelWatchEndpoint.adClientParams$exist",
          ];
          tmp_ytInitialData_rule__.length &&
            (tmp_ytInitialData_rule = tmp_ytInitialData_rule__);
          return_obj.ytInitialReelWatchSequenceResponse_rule =
            tmp_ytInitialReelWatchSequenceResponse_rule;
          return_obj.ytInitialData_rule = tmp_ytInitialData_rule;
          return return_obj;
        }

        if (page_type_.includes("yt_watch")) {
          return function (json_obj) {
            if (json_obj.continuation) return [];
            let video_item_base_path;
            let video_sub_path;
            let section_sub_path;
            let player_bottom_path;
            let player_bottom_section_path;
            type = type || "init";
            if (type === "next") {
              if (
                json_obj.onResponseReceivedEndpoints?.[0]
                  ?.appendContinuationItemsAction?.continuationItems?.length
              ) {
                let target_id =
                  json_obj.onResponseReceivedEndpoints[0]
                    .appendContinuationItemsAction.targetId;
                if (target_id.startsWith("comment-replies")) return [];
                video_item_base_path =
                  "abs:onResponseReceivedEndpoints[0].appendContinuationItemsAction.continuationItems[*]";
                video_sub_path = "/.videoWithContextRenderer";
                section_sub_path = "/.reelShelfRenderer";
              }
            } else if (type === "init") {
              if (mobile_web) {
                if (
                  json_obj.contents?.singleColumnWatchNextResults?.results
                    ?.results?.contents?.length
                ) {
                  let length =
                    json_obj.contents.singleColumnWatchNextResults.results
                      .results.contents.length;
                  video_item_base_path = `abs:contents.singleColumnWatchNextResults.results.results.contents[${
                    length - 1
                  }].itemSectionRenderer.contents[*]`;
                  length > 1 &&
                    (player_bottom_path = `abs:contents.singleColumnWatchNextResults.results.results.contents[0-${
                      length - 2
                    }]`);
                  cur_watch_channle_id =
                    json_obj.contents.singleColumnWatchNextResults.results
                      .results.contents?.[1]?.slimVideoMetadataSectionRenderer
                      ?.contents?.[1]?.slimOwnerRenderer?.title.runs[0]
                      .navigationEndpoint.browseEndpoint.browseId;
                  player_bottom_section_path =
                    "/.itemSectionRenderer.contents[0].reelShelfRenderer";
                  video_sub_path = "/.videoWithContextRenderer";
                  section_sub_path = "/.reelShelfRenderer";
                }
              } else {
                let is_next_target_id;
                if (
                  json_obj.contents?.twoColumnWatchNextResults?.secondaryResults
                    ?.secondaryResults?.results?.[1]?.itemSectionRenderer
                    ?.contents?.length
                ) {
                  video_item_base_path =
                    "abs:contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results[1].itemSectionRenderer.contents[*]";
                  player_bottom_path =
                    "abs:contents.twoColumnWatchNextResults.results.results.contents[*]";
                  is_next_target_id =
                    json_obj.contents.twoColumnWatchNextResults.secondaryResults
                      .secondaryResults.results[1].itemSectionRenderer
                      .targetId === "watch-next-feed";
                  cur_watch_channle_id =
                    json_obj.contents.twoColumnWatchNextResults.results.results
                      .contents?.[1]?.videoSecondaryInfoRenderer?.owner
                      ?.videoOwnerRenderer?.title.runs[0].navigationEndpoint
                      .browseEndpoint.browseId;
                  player_bottom_section_path =
                    "/.itemSectionRenderer.contents[0]";
                  video_sub_path = "/.compactVideoRenderer";
                  section_sub_path = "/.reelShelfRenderer";
                }
                if (
                  !is_next_target_id &&
                  json_obj.contents?.twoColumnWatchNextResults?.secondaryResults
                    ?.secondaryResults?.results?.[0]?.richGridRenderer?.contents
                    ?.length
                ) {
                  video_item_base_path =
                    "abs:contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results[0].richGridRenderer.contents[*]";
                  player_bottom_path =
                    "abs:contents.twoColumnWatchNextResults.results.results.contents[*]";
                  is_next_target_id =
                    json_obj.contents.twoColumnWatchNextResults.secondaryResults
                      .secondaryResults.results[0].richGridRenderer.targetId ===
                    "watch-next-feed";
                  cur_watch_channle_id =
                    json_obj.contents.twoColumnWatchNextResults.results.results
                      .contents?.[1]?.videoSecondaryInfoRenderer?.owner
                      ?.videoOwnerRenderer?.title.runs[0].navigationEndpoint
                      .browseEndpoint.browseId;
                  player_bottom_section_path =
                    "/.itemSectionRenderer.contents[0]";
                  video_sub_path = "/.richItemRenderer.content.videoRenderer";
                  section_sub_path =
                    "/.richSectionRenderer.content.richShelfRenderer";
                }
                if (
                  !is_next_target_id &&
                  json_obj.contents?.twoColumnWatchNextResults?.secondaryResults
                    ?.secondaryResults?.results?.length
                ) {
                  video_item_base_path =
                    "abs:contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results[*]";
                  player_bottom_path =
                    "abs:contents.twoColumnWatchNextResults.results.results.contents[*]";
                  cur_watch_channle_id =
                    json_obj.contents.twoColumnWatchNextResults.results.results
                      .contents?.[1]?.videoSecondaryInfoRenderer?.owner
                      ?.videoOwnerRenderer?.title.runs[0].navigationEndpoint
                      .browseEndpoint.browseId;
                  player_bottom_section_path =
                    "/.itemSectionRenderer.contents[0]";
                  video_sub_path = "/.compactVideoRenderer";
                  section_sub_path = "/.reelShelfRenderer";
                }
              }
            }
            if (!video_item_base_path) return [];

            const rules = [];
            let video_item_rules = [];
            let section_item_rules = [];
            let player_bottom_rules = [];

            mobile_web &&
              type === "init" &&
              player_bottom_rules.push(
                `${player_bottom_section_path.replace(
                  /\.[^\.]+$/,
                  "",
                )}.adSlotRenderer$exist`,
              );
            !mobile_web && type === "init" && player_bottom_rules.push(`/.merchandiseShelfRenderer$exist`);
            video_item_rules.push(
              `${video_sub_path.replace(/\.[^\.]+$/, ".adSlotRenderer$exist")}`,
            );

            if (
              user_data.open_recommend_movie === "off" &&
              cur_watch_channle_id !== "UClgRkhTL3_hImCAmdLfDE4g"
            ) {
              if (mobile_web) {
                video_item_rules.push(
                  `${video_sub_path}.badges[0].metadataBadgeRenderer.style=BADGE_STYLE_TYPE_YPC`,
                );
              } else {
                video_item_rules.push(
                  `${video_sub_path.replace(
                    /\.[^\.]+$/,
                    ".compactMovieRenderer",
                  )}$exist`,
                );
              }
            }

            if (
              ["off", "subscribed"].includes(user_data.open_recommend_liveroom)
            ) {
              if (mobile_web)
                video_item_rules.push(
                  `${video_sub_path}.thumbnailOverlays[0].thumbnailOverlayTimeStatusRenderer.style=LIVE|UPCOMING`,
                );
              else
                video_item_rules.push(
                  `${video_sub_path}.badges[0].metadataBadgeRenderer.style=BADGE_STYLE_TYPE_LIVE_NOW`,
                );
            }

            if (
              user_data.open_recommend_shorts === "subscribed" &&
              type === "init" &&
              page_type !== "mobile_yt_watch"
            ) {
              rules.push(
                `${video_item_base_path.replace(
                  "[*]",
                  "",
                )}=+(arr_insert,method(shorts_fun.get_shorts_section()),0) @user_data.shorts_list.length$value>0`,
              );
            }

            if (
              ["off", "subscribed"].includes(user_data.open_recommend_shorts)
            ) {
              section_item_rules.push(
                `${section_sub_path}.icon.iconType=YOUTUBE_SHORTS_BRAND_24`,
              );
              mobile_web &&
                type === "init" &&
                player_bottom_rules.push(
                  `${player_bottom_section_path}.icon.iconType=YOUTUBE_SHORTS_BRAND_24`,
                );
            }

            player_bottom_rules.length &&
              rules.push(
                `${player_bottom_path}=- ${player_bottom_rules.join(
                  data_process.condition_split_or_tag,
                )}`,
              );
            section_item_rules.length &&
              video_item_rules.push(...section_item_rules);
            video_item_rules.length &&
              rules.push(
                `${video_item_base_path}=- ${video_item_rules.join(
                  data_process.condition_split_or_tag,
                )}`,
              );
            return rules;
          };
        }

        if (page_type_.includes("yt_home")) {
          let item_path;
          let item_rules = [];
          let rules = [];
          type = type || "init";
          if (type === "browse") {
            item_path =
              "abs:onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems[*]";
          } else if (type === "init") {
            item_path = `abs:contents.${
              mobile_web
                ? "singleColumnBrowseResultsRenderer"
                : "twoColumnBrowseResultsRenderer"
            }.tabs[0].tabRenderer.content.richGridRenderer.contents[*]`;
          } else {
            return {};
          }
          const video_path = `/.richItemRenderer.content.${
            mobile_web ? "videoWithContextRenderer" : "videoRenderer"
          }`;
          const section_path = `/.richSectionRenderer.content.${
            mobile_web ? "reelShelfRenderer" : "richShelfRenderer"
          }`;

          item_rules.push("/.richItemRenderer.content.adSlotRenderer$exist");

          !mobile_web &&
            type === "init" &&
            rules.push(
              "abs:contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.masthead=- $exist",
            );

          if (["off", "subscribed"].includes(user_data.open_recommend_shorts)) {
            item_rules.push(
              `${section_path}.icon.iconType=YOUTUBE_SHORTS_BRAND_24`,
            );
          }

          if (user_data.open_recommend_popular === "off") {
            item_rules.push(
              `${section_path}.endpoint.browseEndpoint.browseId=FEtrending`,
            );
          }

          if (user_data.open_recommend_playables === "off") {
            item_rules.push(
              "/.richSectionRenderer.content.richShelfRenderer.endpoint.browseEndpoint.browseId=FEmini_app_destination",
            );
          }

          if (
            user_data.open_recommend_shorts === "subscribed" &&
            type === "init"
          ) {
            rules.push(
              item_path.replace("[*]", "") +
                "=+(arr_insert,method(shorts_fun.get_shorts_section()),0) @user_data.shorts_list.length$value>0",
            );
          }

          if (
            ["off", "subscribed"].includes(user_data.open_recommend_liveroom)
          ) {
            !mobile_web &&
              item_rules.push(
                `${video_path}.badges[0].metadataBadgeRenderer.style=BADGE_STYLE_TYPE_LIVE_NOW`,
              );
            const tag_express = `UPCOMING${
              mobile_web ? data_process.value_split_or_tag + "LIVE" : ""
            }`;
            item_rules.push(
              `${video_path}.thumbnailOverlays[-1].thumbnailOverlayTimeStatusRenderer.style=${tag_express}`,
            );
          }

          if (user_data.open_recommend_movie === "off") {
            item_rules.push(
              `${section_path}.endpoint.browseEndpoint.browseId=FEstorefront|UClgRkhTL3_hImCAmdLfDE4g`,
            );
            item_rules.push(
              `${video_path}.badges[0].metadataBadgeRenderer.style=BADGE_STYLE_TYPE_YPC`,
            );
          }

          item_rules.push(
            "/.richSectionRenderer.content.statementBannerRenderer$exist",
          );

          rules.push("abs:survey=- $exist");

          item_rules.push(
            section_path.replace(/\.[^\.]+$/, ".inlineSurveyRenderer$exist"),
          );

          item_rules.push(
            section_path.replace(/\.[^\.]+$/, ".primetimePromoRenderer$exist"),
          );

          const add_movie_channel_rule =
            "loadingStrategy.inlineContent.moreDrawerViewModel.content=+sobj(" +
            (mobile_web ? "mobile_" : "") +
            "movie_channel_info) !~=" +
            flag_info.movie_channel;
          rules.push(add_movie_channel_rule);

          rules.push(
            `${item_path}=- ${item_rules.join(
              data_process.condition_split_or_tag,
            )}`,
          );
          return_obj.ytInitialData_rule = rules;
          return return_obj;
        }
        return return_obj;
      },
    };
  }

  function set_search_listen() {
    let count = 0;
    const interval_id = setInterval(() => {
      if (
        ![
          "yt_watch",
          "yt_home",
          "yt_search",
          "mobile_yt_search",
          "mobile_yt_home_searching",
          "mobile_yt_watch_searching",
          "yt_shorts",
          "yt_music_home",
          "yt_music_watch",
          "yt_watch_playlist",
          "other",
        ].includes(page_type)
      ) {
        clearInterval(interval_id);
        return;
      }
      count++;
      const search_selector = href.includes("https://m.youtube.com/")
        ? "input.searchbox-input.title"
        : href.includes("https://music.youtube.com/")
          ? "input.ytmusic-search-box"
          : "input.yt-searchbox-input";
      const search_input_node = $(search_selector);
      if (search_input_node) {
        clearInterval(interval_id);
        if (search_input_node.set_listener) return;

        search_input_node.set_listener = true;
        const oninput = function (event) {
          if (
            [
              open_config_keyword,
            ].includes(this.value)
          ) {
            setTimeout(() => {
              search_input_node.blur();

              const closeSearchPanel = () => {
                const escapeEvent = new KeyboardEvent("keydown", {
                  key: "Escape",
                  code: "Escape",
                  keyCode: 27,
                  which: 27,
                  bubbles: true,
                  cancelable: true,
                });
                search_input_node.dispatchEvent(escapeEvent);
              };

              if (search_input_node.value === open_config_keyword) {
                search_input_node.value = "";
                search_input_node.dispatchEvent(
                  new Event("input", { bubbles: true }),
                );
                closeSearchPanel();
                display_settings_win("general");
              }
            }, 500);
          }
        };
        search_input_node.addEventListener("input", oninput);
      } else if (count > 50) {
        clearInterval(interval_id);
        log("Search box not found", -1);
      }
    }, 200);
  }

  function hide_create_button() {
    const labels = [
      "Create",
      "Create ",
      "Create a Short",
      "Create video",
      "Create post",
    ];

    const selectorParts = labels.map(
      (l) => `ytd-button-renderer.ytd-masthead button[aria-label="${l}"]`,
    );
    const selector = selectorParts.join(",");

    $$(selector).forEach((btn) => {
      const renderer = btn.closest("ytd-button-renderer.ytd-masthead") || btn;
      renderer.style.display = "none";
    });
  }

  function hide_explore_more_topics_section() {
    const chipsShelves = $$(".ytdChipsShelfWithVideoShelfRendererHost");
    chipsShelves.forEach((el) => {
      const section = el.closest("ytd-rich-section-renderer") || el;
      if (section.style.display !== "none") {
        section.style.display = "none";
        log('Hidden "Explore more topics" via class', 0);
      }
    });
  }

  function hide_shorts_sections_if_disabled() {
    const shortsHidden =
      user_data.global_shorts_block === "on" ||
      user_data.open_recommend_shorts === "off";

    if (!shortsHidden) return;

    $$("#contents ytd-rich-section-renderer").forEach((section) => {
      const titleSpan = section.querySelector(
        ".yt-shelf-header-layout__title-row .yt-shelf-header-layout__title .yt-core-attributed-string",
      );
      const text = titleSpan?.textContent?.trim();
      if (!text) return;

      if (text === "Shorts") {
        section.style.display = "none";
        log('Hidden "Shorts" rich section', 0);
      }
    });

    $$(
      "#contents .yt-shelf-header-layout__title .yt-core-attributed-string",
    ).forEach((span) => {
      const txt = span.textContent.trim();
      if (txt === "Shorts") {
        const richSection = span.closest("ytd-rich-section-renderer");
        if (richSection) {
          richSection.style.display = "none";
          log('Hidden generic "Shorts" rich section', 0);
        }
      }
    });

    $$("grid-shelf-view-model").forEach((shelf) => {
      const titleSpan = shelf.querySelector(
        ".yt-shelf-header-layout__title .yt-core-attributed-string",
      );
      const txt = titleSpan?.textContent?.trim();
      if (txt === "Shorts") {
        shelf.style.display = "none";
        log('Hidden grid-shelf "Shorts" section', 0);
      }
    });
  }

  function hide_teaser_carousel(node) {
    if (user_data.watch_page_config?.hide_live_chat_replay !== "on") return;
    if (!node) node = $("#teaser-carousel");
    if (!node) return;
    node.style.display = "none";
    log("Hidden Live chat replay teaser (#teaser-carousel)", 0);
  }

  function simulate_swipeup(target, start, end) {
    function createAndDispatchTouchEvent(type, target, clientY) {
      const touches =
        (type !== "touchend" && [
          new Touch({
            identifier: 0,
            target: target,
            clientY: clientY,
          }),
        ]) ||
        [];
      let touchEvent = new TouchEvent(type, {
        touches: touches,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(touchEvent);
    }
    createAndDispatchTouchEvent("touchstart", target, start);
    createAndDispatchTouchEvent("touchmove", target, end);
    createAndDispatchTouchEvent("touchend", target);
  }

  function getCookie(cookieName) {
    const name = cookieName + "=";
    let decodedCookie;
    try {
      decodedCookie = decodeURIComponent(document.cookie);
    } catch (error) {
      log("cookie decode error", error, -1);
      return null;
    }
    const cookieArray = decodedCookie.split(";");
    for (let i = 0; i < cookieArray.length; i++) {
      const cookie = cookieArray[i].trim();

      if (cookie.startsWith(name)) {
        return cookie.substring(name.length, cookie.length);
      }
    }
    return null;
  }

  function check_native(name, fun) {
    const fun_str = fun.toString();
    if (browser_info.name !== "Firefox") {
      return `function ${name}() { [native code] }` === fun_str;
    } else {
      return `function ${name}() {\n    [native code]\n}` === fun_str;
    }
  }

  function set_history_hook(window_obj) {
    const wrap = function (type) {
      const origin = window_obj.history[type];
      return function () {
        let rv;
        try {
          rv = origin.apply(this, arguments);
        } catch (error) {
          log("history hook error", error, 0);
          return;
        }
        let url = arguments[2] || location.href;
        url.startsWith("/") && (url = location.origin + url);
        !url.startsWith("http") && (url = location.origin + "/" + url);
        url_change(url);
        return rv;
      };
    };
    window_obj.history.pushState = wrap("pushState");
    window_obj.history.replaceState = wrap("replaceState");
  }

  function url_observer() {
    set_history_hook(unsafeWindow);
    unsafeWindow.addEventListener("popstate", function (event) {
      url_change(event);
    });
    unsafeWindow.addEventListener("hashchange", function (event) {
      url_change(event);
    });
  }

  function url_change(event = null) {
    let destination_url;
    if (typeof event === "object")
      destination_url = event?.destination?.url || "";
    else destination_url = event;

    if (destination_url?.startsWith?.("about:blank")) return;
    if (destination_url === href) return;
    href = destination_url || location.href;
    log("Page URL changed href -> " + href, 0);
    const tmp_page_type = get_page_type();
    if (tmp_page_type !== page_type) {
      page_type = tmp_page_type;
      config_api.config_init();
      set_search_listen();
    }
    on_page_change();
  }

  function get_page_type(url = href) {
    if (!url) return "other";
    url.startsWith("/") && (url = location.origin + url);
    const base_url = url.split("?")[0];
    let tmp_page_type;
    if (base_url.match("https://www.youtube.com/?$")) tmp_page_type = "yt_home";
    else if (base_url.match("https://m.youtube.com/?#?$"))
      tmp_page_type = "mobile_yt_home";
    else if (base_url.match("https://www.youtube.com/watch$"))
      tmp_page_type = "yt_watch";
    else if (base_url.match("https://m.youtube.com/watch$"))
      tmp_page_type = "mobile_yt_watch";
    else if (base_url.match("https://www.youtube.com/results$"))
      tmp_page_type = "yt_search";
    else if (base_url.match("https://m.youtube.com/results$"))
      tmp_page_type = "mobile_yt_search";
    else if (base_url.startsWith("https://www.youtube.com/shorts"))
      tmp_page_type = "yt_shorts";
    else if (base_url.startsWith("https://m.youtube.com/shorts"))
      tmp_page_type = "mobile_yt_shorts";
    else if (base_url.match("https://www.youtubekids.com/watch$"))
      tmp_page_type = "yt_kids_watch";
    else if (base_url.match("https://music.youtube.com/?$"))
      tmp_page_type = "yt_music_home";
    else if (base_url.match("https://music.youtube.com/watch$"))
      tmp_page_type = "yt_music_watch";
    else if (base_url.match("https://m.youtube.com/#searching$"))
      tmp_page_type = "mobile_yt_home_searching";
    else if (base_url.startsWith("https://www.youtube.com/playlist"))
      tmp_page_type = "yt_watch_playlist";
    else if (base_url.includes("channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"))
      tmp_page_type = "yt_music_channel";
    else tmp_page_type = "other";
    if (tmp_page_type === "mobile_yt_watch" && href.endsWith("#searching"))
      tmp_page_type = "mobile_yt_watch_searching";
    return tmp_page_type;
  }

  function set_debugger() {
    while (!debugger_fun_name) {
      let tmp = crypto
        .randomUUID()
        .substring(0, Math.floor(Math.random() * 4) + 3)
        .replace(/-/g, "");
      tmp = tmp.match("[a-z].+")?.[0];
      if (tmp && !unsafeWindow[tmp]) {
        debugger_fun_name = tmp;
      }
    }
    log(`debugger_fun_name： ${debugger_fun_name}`, 0);
    const debugger_config_info = {
      ytInitialPlayerResponse: debugger_ytInitialPlayerResponse,
      ytInitialData: debugger_ytInitialData,
      ytInitialReelWatchSequenceResponse:
        debugger_ytInitialReelWatchSequenceResponse,
      music_initialData: debugger_music_initialData,
      inject_info: inject_info,
      info: [
        "ytInitialData_rule",
        "ytInitialPlayerResponse_rule",
        "is_account_init",
        "user_data",
        "mobile_web",
        "page_type",
        "tmp_debugger_value",
      ],
    };
    unsafeWindow[debugger_fun_name] = function (action = null) {
      const keys = Object.keys(debugger_config_info);
      if (!action && action !== 0) {
        debugger;
        return;
      }
      if (action === "ytInitialPlayerResponse")
        log("ytInitialPlayerResponse", debugger_ytInitialPlayerResponse, 0);
      if (action === "ytInitialData")
        log("ytInitialData", debugger_ytInitialData, 0);
      if (action === "inject_info") log("inject_info", inject_info, 0);
      if (action === "info") {
        if (limit_eval) {
          log("eval is restricted", 0);
        } else {
          for (let key of debugger_config_info["info"]) {
            log(key, eval(trustedScript(key)), 0);
          }
        }
        return;
      }
      if (action === "list") {
        keys.forEach(function (key, index) {
          log(index, key, 0);
        });
      }
      if (typeof action === "number") {
        if (action < keys.length) {
          unsafeWindow[debugger_fun_name](keys[action]);
        } else if (action >= keys.length) {
          keys.forEach(function (key) {
            unsafeWindow[debugger_fun_name](key);
          });
        }
      }
    };
  }

  function log() {
    const arguments_arr = [...arguments];
    const flag = arguments_arr.pop();
    if (flag === -1) {
      error_messages.push(arguments_arr.join(" "));
    }
    if (flag === 999) arguments_arr.unshift("-----test---test-----");
    if (flag !== 0 && flag !== 999) arguments_arr.push(getCodeLocation());
    if (flag === 0 || flag === 999) {
      const array_length = arguments_arr.length;
      const color = flag === 0 ? "orange" : "blue";
      const css_str = `color: ${color};font-size: 20px`;
      for (let i = 0; i < array_length; i++) {
        if (typeof arguments_arr[i] === "string") {
          arguments_arr[i] = "%c" + arguments_arr[i];
          i === array_length - 1
            ? arguments_arr.push(css_str)
            : arguments_arr.splice(i + 1, 0, css_str);
          break;
        }
      }
    }
    if ([-1, 0, 999].includes(flag) || open_debugger)
      flag === -1
        ? origin_console.error(...arguments_arr)
        : origin_console.log(...arguments_arr);
  }

  function getBrowserInfo() {
    const userAgent = navigator.userAgent;
    let browserName;
    let browserVersion;
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent,
      );
    if (userAgent.indexOf("Firefox") > -1) {
      browserName = "Firefox";
      browserVersion = userAgent.match(/Firefox\/([0-9.]+)/)[1];
    } else if (
      userAgent.indexOf("OPR") > -1 ||
      userAgent.indexOf("Opera") > -1
    ) {
      browserName = "Opera";
      browserVersion = userAgent.match(/(OPR|Opera)\/([0-9.]+)/)[2];
    } else if (userAgent.indexOf("Edg") > -1) {
      browserName = "Edge";
      browserVersion = userAgent.match(/Edg\/([0-9.]+)/)[1];
    } else if (userAgent.indexOf("Chrome") > -1) {
      browserName = "Chrome";
      browserVersion = userAgent.match(/Chrome\/([0-9.]+)/)[1];
    } else if (userAgent.indexOf("Safari") > -1) {
      browserName = "Safari";
      browserVersion = userAgent.match(/Version\/([0-9.]+)/)[1];
    } else if (
      userAgent.indexOf("MSIE") > -1 ||
      userAgent.indexOf("rv:") > -1
    ) {
      browserName = "Internet Explorer";
      browserVersion = userAgent.match(/(MSIE |rv:)([0-9.]+)/)[2];
    } else {
      browserName = "Unknown";
      browserVersion = "N/A";
    }

    return {
      name: browserName,
      version: browserVersion,
      isMobile: isMobile,
    };
  }

  function getCodeLocation() {
    if (["Firefox"].includes(browser_info.name)) return "";
    const callstack = new Error().stack.split("\n");
    callstack.shift();
    while (callstack.length && callstack[0].includes("-extension://")) {
      callstack.shift();
    }
    if (!callstack.length) {
      return "";
    }
    return "\n" + callstack[0].trim();
  }

  function init_disable_saturated_hover() {
    const styleId = "no-saturated-hover-style";

    const removeStyle = () => {
      const el = unsafeWindow.document.getElementById(styleId);
      if (el) el.remove();
    };

    if (unsafeWindow.__yt_saturated_hover_listeners) {
      const [navL, darkL] = unsafeWindow.__yt_saturated_hover_listeners;
      unsafeWindow.removeEventListener("yt-navigate-finish", navL);
      unsafeWindow.removeEventListener("yt-dark-mode-toggled", darkL);
      unsafeWindow.__yt_saturated_hover_listeners = null;
    }

    if (user_data.disable_saturated_hover !== "on") {
      removeStyle();
      return;
    }

    const detectDark = () => {
      const html = unsafeWindow.document.documentElement;
      if (html.hasAttribute("dark") || html.classList.contains("dark-theme")) return true;
      if (html.hasAttribute("light") || html.classList.contains("light-theme")) return false;
      try {
        const bg = (getComputedStyle(html).getPropertyValue("--yt-spec-base-background") || "").trim();
        if (bg.startsWith("rgb")) {
          const nums = bg.match(/\d+/g);
          if (nums && nums.length >= 3) {
            return ((+nums[0] + +nums[1] + +nums[2]) / 3) < 60;
          }
        }
      } catch (e) {}
      return false;
    };

    const updatePlaylistPanel = () => {
      for (const panel of unsafeWindow.document.querySelectorAll("ytd-playlist-panel-renderer")) {
        panel.style.setProperty("--yt-active-playlist-panel-background-color", "var(--yt-spec-additive-background)");
        panel.style.setProperty("--yt-lightsource-primary-title-color", "var(--ytc-text-primary)");
        panel.style.setProperty("--yt-lightsource-secondary-title-color", "var(--ytc-text-secondary)");
        panel.style.setProperty("--iron-icon-fill-color", "var(--yt-lightsource-primary-title-color)");
      }
    };

    let retryRafId = null;
    const retryPlaylistPanel = () => {
      if (retryRafId) cancelAnimationFrame(retryRafId);
      let attempts = 0;
      const check = () => {
        if (unsafeWindow.document.querySelector("ytd-playlist-panel-renderer")) {
          updatePlaylistPanel();
          return;
        }
        if (++attempts < 60) retryRafId = requestAnimationFrame(check);
      };
      check();
    };

    const buildCss = (d) => (`
html {
  --ytc-base-background:${d ? "#0f0f0f" : "#fff"};
  --ytc-additive-background:${d ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"};
  --ytc-text-primary:${d ? "#f1f1f1" : "#0f0f0f"};
  --ytc-text-secondary:${d ? "#aaa" : "#606060"};
  --yt-spec-base-background:var(--yt-spec-base-background,var(--ytc-base-background));
  --yt-spec-additive-background:var(--yt-spec-additive-background,var(--ytc-additive-background));
  --yt-spec-text-primary:var(--yt-spec-text-primary,var(--ytc-text-primary));
  --yt-spec-text-secondary:var(--yt-spec-text-secondary,var(--ytc-text-secondary));
}

yt-touch-feedback-shape,
.yt-spec-touch-feedback-shape__hover-effect,
.yt-spec-touch-feedback-shape__stroke,
.yt-spec-touch-feedback-shape__fill,
.ytSpecTouchFeedbackShapeHost,
.ytSpecTouchFeedbackShapeHoverEffect,
.ytSpecTouchFeedbackShapeStroke,
.ytSpecTouchFeedbackShapeFill {
  display:none !important;
  background:transparent !important;
  background-color:transparent !important;
  border-color:transparent !important;
  opacity:0 !important;
  pointer-events:none !important;
}

/* 3-dot "More actions" button on video cards (related sidebar, grid, search):
   remove its background circle / backdrop blur */
.ytLockupMetadataViewModelMenuButton button-view-model,
.ytLockupMetadataViewModelMenuButton button,
.ytLockupMetadataViewModelMenuButton .ytSpecButtonShapeNextHost,
.ytLockupMetadataViewModelMenuButton .ytSpecButtonShapeNextIcon,
.ytLockupMetadataViewModelMenuButton .ytSpecButtonShapeNextElevatedContent {
  background:transparent !important;
  background-color:transparent !important;
  -webkit-backdrop-filter:none !important;
  backdrop-filter:none !important;
  box-shadow:none !important;
}

ytd-rich-item-renderer.ytd-rich-item-renderer-highlight {
  background:transparent !important;
  box-shadow:none !important;
  --yt-spec-outline:transparent !important;
}

ytd-rich-grid-renderer #video-title,
.yt-lockup-metadata-view-model__title,
.yt-lockup-metadata-view-model__title a,
ytd-watch-metadata .yt-core-attributed-string--link-inherit-color:not(:has(a)),
ytd-watch-metadata #description,
ytd-video-secondary-info-renderer #description,
ytd-watch-info-text,
#metadata.ytd-watch-info-text,
#metadata-line.ytd-video-primary-info-renderer span,
#snippet-text,
#snippet-text *,
#attributed-snippet-text,
#attributed-snippet-text *,
#snippet-text :not(a):hover,
#attributed-snippet-text :not(a):hover,
ytd-watch-info-text :not(a):hover,
.yt-core-attributed-string--highlight-text-decorator>a.yt-core-attributed-string__link--call-to-action-color,
.yt-core-attributed-string--link-inherit-color .yt-core-attributed-string--highlight-text-decorator>a.yt-core-attributed-string__link--call-to-action-color,
ytd-watch-metadata #owner .yt-core-attributed-string__link--call-to-action-color,
a[href^="/watch"][style*="color"],
a[href^="/watch"] span[style*="color"] {
  color:var(--yt-spec-text-primary,var(--ytc-text-primary)) !important;
}

.yt-lockup-metadata-view-model__metadata,
.yt-lockup-metadata-view-model__metadata span,
#metadata-line span,
.yt-content-metadata-view-model__metadata-text,
.yt-content-metadata-view-model__metadata-text span,
.yt-content-metadata-view-model__delimiter,
.ytLockupMetadataViewModelMetadata,
.ytLockupMetadataViewModelMetadata * {
  color:var(--yt-spec-text-secondary,var(--ytc-text-secondary)) !important;
}

.ytLockupMetadataViewModelMetadata a.yt-core-attributed-string__link:hover {
  color:var(--yt-spec-text-primary,var(--ytc-text-primary)) !important;
}

ytd-watch-metadata :not(.yt-core-attributed-string--highlight-text-decorator)>.yt-core-attributed-string__link--call-to-action-color,
#snippet-text :not(.yt-core-attributed-string--highlight-text-decorator)>.yt-core-attributed-string__link--call-to-action-color,
#attributed-snippet-text :not(.yt-core-attributed-string--highlight-text-decorator)>.yt-core-attributed-string__link--call-to-action-color {
  color:var(--yt-spec-call-to-action,#3ea6ff) !important;
}

ytd-watch-metadata,.ytd-watch-metadata {
  --yt-saturated-base-background:var(--ytc-base-background);
  --yt-saturated-raised-background:var(--yt-spec-additive-background,var(--ytc-additive-background));
  --yt-saturated-additive-background:var(--yt-spec-additive-background,var(--ytc-additive-background));
  --yt-saturated-text-primary:var(--yt-spec-text-primary,var(--ytc-text-primary));
  --yt-saturated-text-secondary:var(--yt-spec-text-secondary,var(--ytc-text-secondary));
  --yt-saturated-overlay-background:var(--yt-spec-additive-background,var(--ytc-additive-background));
  --yt-spec-overlay-background:var(--yt-spec-additive-background,var(--ytc-additive-background));
  --yt-spec-static-overlay-background-light:var(--yt-spec-additive-background,var(--ytc-additive-background));
  --yt-active-playlist-panel-background-color:var(--yt-spec-additive-background);
  --yt-lightsource-primary-title-color:var(--ytc-text-primary);
  --yt-lightsource-secondary-title-color:var(--ytc-text-secondary);
  --iron-icon-fill-color:var(--yt-lightsource-primary-title-color);
}

.yt-core-attributed-string--highlight-text-decorator {
  background-color:var(--yt-spec-static-overlay-background-light,PLACEHOLDER_COLOR) !important;
  border-radius:8px !important;
  padding-bottom:1px !important;
}

ytd-masthead[is-watch-page][dark]:not([theater]):not([fullscreen]) #background.ytd-masthead,
ytd-masthead[is-shorts-page][dark] #background.ytd-masthead,
#background.ytd-masthead {
  opacity:1 !important;
  background:var(--yt-spec-base-background,var(--ytc-base-background)) !important;
}
`).trim().replace("PLACEHOLDER_COLOR", d ? "rgba(255,255,255,0.102)" : "rgba(0,0,0,0.051)");

    const CSS_CACHE = { dark: buildCss(true), light: buildCss(false) };

    const apply = () => {
      const isDark = detectDark();
      let styleEl = unsafeWindow.document.getElementById(styleId);
      if (!styleEl) {
        styleEl = unsafeWindow.document.createElement("style");
        styleEl.id = styleId;
        (unsafeWindow.document.head || unsafeWindow.document.documentElement).appendChild(styleEl);
      }
      const newCss = isDark ? CSS_CACHE.dark : CSS_CACHE.light;
      if (styleEl.textContent !== newCss) styleEl.textContent = newCss;
      updatePlaylistPanel();
      retryPlaylistPanel();
    };

    apply();

    const navListener = () => apply();
    const darkListener = () => apply();
    unsafeWindow.addEventListener("yt-navigate-finish", navListener, { passive: true });
    unsafeWindow.addEventListener("yt-dark-mode-toggled", darkListener, { passive: true });
    unsafeWindow.__yt_saturated_hover_listeners = [navListener, darkListener];
  }


  // Return YouTube Dislike (always on, read-only): shows the estimated dislike count
  // BEFORE the thumbs-down icon, inside the dislike button.
  // Data: https://returnyoutubedislikeapi.com (attribution: returnyoutubedislike.com)
  function init_return_dislike() {
    const STYLE_ID = "vbt-ryd-style";
    const API = "https://returnyoutubedislikeapi.com/votes?videoId=";
    const CACHE_TTL = 10 * 60 * 1000;
    const doc = unsafeWindow.document;
    const st = (unsafeWindow.__vbt_ryd = unsafeWindow.__vbt_ryd || {
      cache: new Map(),
      pending: new Set(),
      blockedUntil: 0,
      observer: null,
      navListener: null,
      raf: 0,
      gen: 0,
    });
    const gen = ++st.gen;

    if (st.observer) {
      st.observer.disconnect();
      st.observer = null;
    }
    if (st.navListener) {
      unsafeWindow.removeEventListener("yt-navigate-finish", st.navListener);
      st.navListener = null;
    }
    if (st.raf) {
      cancelAnimationFrame(st.raf);
      st.raf = 0;
    }
    const removeAll = () => {
      doc.getElementById(STYLE_ID)?.remove();
      doc.querySelectorAll(".vbt-ryd-count").forEach((n) => n.remove());
      doc.querySelectorAll(".vbt-ryd-on").forEach((n) => n.classList.remove("vbt-ryd-on"));
    };
    removeAll();

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      button.vbt-ryd-on {
        display: inline-flex !important;
        align-items: center !important;
        width: auto !important;
        min-width: 0 !important;
        gap: 6px !important;
        padding-inline: 16px 12px !important;
      }
      .vbt-ryd-count { margin: 0 !important; }
    `;
    (doc.head || doc.documentElement).appendChild(style);

    const fmt = (n) => {
      if (n < 1000) return String(n);
      try {
        return new Intl.NumberFormat(doc.documentElement.lang || "en", {
          notation: "compact",
          maximumSignificantDigits: 2,
        }).format(n);
      } catch (e) {
        return String(n);
      }
    };

    const schedule = () => {
      if (!st.raf) st.raf = requestAnimationFrame(ensure);
    };

    const fetchVotes = (id) => {
      if (st.pending.has(id) || Date.now() < st.blockedUntil) return;
      st.pending.add(id);
      const fail = () => {
        st.pending.delete(id);
        // short negative cache (30s) so we don't retry on every DOM mutation
        st.cache.set(id, { dislikes: null, t: Date.now() - CACHE_TTL + 30000 });
      };
      GM_xmlhttpRequest({
        method: "GET",
        url: API + encodeURIComponent(id),
        headers: { Accept: "application/json" },
        timeout: 10000,
        onload: (res) => {
          st.pending.delete(id);
          if (res.status === 429) {
            st.blockedUntil = Date.now() + 60000; // back off as the API asks
            return;
          }
          let dislikes = null;
          if (res.status === 200) {
            try {
              const d = JSON.parse(res.responseText);
              if (typeof d.dislikes === "number" && !d.deleted) dislikes = d.dislikes;
            } catch (e) {}
          }
          if (st.cache.size > 200) st.cache.delete(st.cache.keys().next().value);
          st.cache.set(id, { dislikes, t: Date.now() });
          if (st.gen === gen) schedule();
        },
        onerror: fail,
        ontimeout: fail,
      });
    };

    function ensure() {
      st.raf = 0;
      if (st.gen !== gen) return;
      const btn =
        doc.querySelector("ytd-watch-metadata dislike-button-view-model button") ||
        doc.querySelector("dislike-button-view-model button");
      const existing = btn && btn.querySelector(".vbt-ryd-count");
      const remove = () => {
        if (existing) existing.remove();
        if (btn) btn.classList.remove("vbt-ryd-on");
      };
      if (!btn || unsafeWindow.location.pathname !== "/watch") return remove();
      const id = new URLSearchParams(unsafeWindow.location.search).get("v");
      if (!id) return remove();

      let entry = st.cache.get(id);
      if (entry && Date.now() - entry.t > CACHE_TTL) {
        st.cache.delete(id);
        entry = null;
      }
      if (!entry) {
        // never show a previous video's number while the new one loads
        if (existing && existing.dataset.vid !== id) remove();
        fetchVotes(id);
        return;
      }
      if (entry.dislikes == null) return remove();

      const text = fmt(entry.dislikes);
      if (existing && existing.dataset.vid === id) {
        if (existing.textContent !== text) existing.textContent = text;
        return;
      }
      if (existing) existing.remove();
      const el = doc.createElement("div");
      el.className =
        "ytSpecButtonShapeNextButtonTextContent ytSpecButtonShapeNextElevatedContent vbt-ryd-count";
      el.dataset.vid = id;
      el.textContent = text;
      el.title = "Estimated dislikes - returnyoutubedislike.com";
      btn.insertBefore(el, btn.firstElementChild); // before the thumbs-down icon
      btn.classList.add("vbt-ryd-on");
    }

    st.navListener = schedule;
    unsafeWindow.addEventListener("yt-navigate-finish", st.navListener, { passive: true });
    st.observer = new MutationObserver(schedule);
    st.observer.observe(doc.documentElement, { childList: true, subtree: true });
    schedule();
  }

  function init_disable_play_on_hover() {
    const styleId = "disable-play-on-hover-style";
    const removeStyle = () => {
      const existing = unsafeWindow.document.getElementById(styleId);
      if (existing) existing.remove();
    };

    if (user_data.disable_play_on_hover !== "on") {
      removeStyle();
      return;
    }

    const css = `
  ytd-thumbnail[is-preview-loading] ytd-thumbnail-overlay-toggle-button-renderer.ytd-thumbnail,
  ytd-thumbnail[is-preview-loading] ytd-thumbnail-overlay-time-status-renderer.ytd-thumbnail,
  ytd-thumbnail[is-preview-loading] ytd-thumbnail-overlay-endorsement-renderer.ytd-thumbnail,
  ytd-thumbnail[is-preview-loading] ytd-thumbnail-overlay-hover-text-renderer.ytd-thumbnail,
  ytd-thumbnail[is-preview-loading] ytd-thumbnail-overlay-button-renderer.ytd-thumbnail,
  ytd-thumbnail[now-playing] ytd-thumbnail-overlay-time-status-renderer.ytd-thumbnail,
  ytd-thumbnail-overlay-loading-preview-renderer[is-preview-loading],
  ytd-grid-video-renderer a#thumbnail div#mouseover-overlay,
  ytd-rich-item-renderer a#thumbnail div#mouseover-overlay,
  ytd-thumbnail-overlay-loading-preview-renderer,
  ytd-moving-thumbnail-renderer img#thumbnail,
  .ytAnimatedThumbnailOverlayViewModelHost,
  animated-thumbnail-overlay-view-model,
  ytd-moving-thumbnail-renderer yt-icon,
  ytd-moving-thumbnail-renderer span,
  ytd-moving-thumbnail-renderer img,
  ytd-moving-thumbnail-renderer,
  #mouseover-overlay,
  ytd-video-preview,
  div#video-preview,
  #video-preview,
  #preview {
    display: none !important;
  }
  `;

    let styleEl = unsafeWindow.document.getElementById(styleId);
    if (!styleEl) {
      styleEl = unsafeWindow.document.createElement("style");
      styleEl.id = styleId;
      unsafeWindow.document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }

  function init_disable_end_cards() {
    const styleId = "disable-end-cards-style";
    const removeStyle = () => {
      const existing = unsafeWindow.document.getElementById(styleId);
      if (existing) existing.remove();
    };

    if (user_data.hide_end_cards !== "on") {
      removeStyle();
      return;
    }

    const css = `
  .ytp-endscreen-container,
  [data-a11y-skip-to-endscreen-button],
  ytd-video-secondary-info-renderer .yt-chip-cloud-chip-renderer,
  .ytp-ce-playlist,
  .ytp-ce-element {
    display: none !important;
  }
  `;

    let styleEl = unsafeWindow.document.getElementById(styleId);
    if (!styleEl) {
      styleEl = unsafeWindow.document.createElement("style");
      styleEl.id = styleId;
      unsafeWindow.document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }

  function init_interruptions_remover() {
    const removeInterruptionsPopup = () => {
      const toasts =
        unsafeWindow.document.querySelectorAll("tp-yt-paper-toast");
      toasts.forEach((toast) => {
        const textEl = toast.querySelector("#text");
        if (
          textEl &&
          textEl.textContent.includes("Experiencing interruptions?")
        ) {
          toast.remove();
        }
      });
    };

    try {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.addedNodes.length) {
            removeInterruptionsPopup();
          }
        });
      });

      observer.observe(unsafeWindow.document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
      });
    } catch (e) {}
  }

  async function init_miniplayer_button() {
    if (
      document.querySelector(
        "#cpfyt-miniplayer-button, .ytp-chrome-bottom .ytp-miniplayer-button",
      )
    )
      return;

    let $sizeButton = null;
    const maxAttempts = 50;
    let attempts = 0;

    while (!$sizeButton && attempts < maxAttempts) {
      $sizeButton = document.querySelector(
        ".ytp-chrome-bottom .ytp-size-button",
      );
      if ($sizeButton) break;
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }

    if (!$sizeButton) return;

    const supportsAnchorPositioning =
      "anchorName" in document.documentElement.style;
    const style = $sizeButton.parentElement.classList.contains(
      "ytp-right-controls-right",
    )
      ? "new"
      : "old";

    const buttonHTML = `<button id="cpfyt-miniplayer-button" class="ytp-button" aria-keyshortcuts="i" ${!supportsAnchorPositioning ? `title="Miniplayer (i)"` : ""}>
        ${
          style == "new"
            ? `
          <svg fill="none" height="24" viewBox="0 0 24 24" width="24">
            <path d="M21.20 3.01C21.66 3.05 22.08 3.26 22.41 3.58C22.73 3.91 22.94 4.33 22.98 4.79L23 5V19C23.00 19.49 22.81 19.97 22.48 20.34C22.15 20.70 21.69 20.93 21.20 20.99L21 21H3L2.79 20.99C2.30 20.93 1.84 20.70 1.51 20.34C1.18 19.97 .99 19.49 1 19V13H3V19H21V5H11V3H21L21.20 3.01ZM1.29 3.29C1.10 3.48 1.00 3.73 1.00 4C1.00 4.26 1.10 4.51 1.29 4.70L5.58 9H3C2.73 9 2.48 9.10 2.29 9.29C2.10 9.48 2 9.73 2 10C2 10.26 2.10 10.51 2.29 10.70C2.48 10.89 2.73 11 3 11H9V5C9 4.73 8.89 4.48 8.70 4.29C8.51 4.10 8.26 4 8 4C7.73 4 7.48 4.10 7.29 4.29C7.10 4.48 7 4.73 7 5V7.58L2.70 3.29C2.51 3.10 2.26 3.00 2 3.00C1.73 3.00 1.48 3.10 1.29 3.29ZM19.10 11.00L19 11H12L11.89 11.00C11.66 11.02 11.45 11.13 11.29 11.29C11.13 11.45 11.02 11.66 11.00 11.89L11 12V17C10.99 17.24 11.09 17.48 11.25 17.67C11.42 17.85 11.65 17.96 11.89 17.99L12 18H19L19.10 17.99C19.34 17.96 19.57 17.85 19.74 17.67C19.90 17.48 20.00 17.24 20 17V12L19.99 11.89C19.97 11.66 19.87 11.45 19.70 11.29C19.54 11.13 19.33 11.02 19.10 11.00ZM13 16V13H18V16H13Z" fill="white"></path>
          </svg>
        `
            : `
          <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
            <use xlink:href="#cpfyt-id-1" class="ytp-svg-shadow"></use>
            <path id="cpfyt-id-1" d="M25,17 L17,17 L17,23 L25,23 L25,17 L25,17 Z M29,25 L29,10.98 C29,9.88 28.1,9 27,9 L9,9 C7.9,9 7,9.88 7,10.98 L7,25 C7,26.1 7.9,27 9,27 L27,27 C28.1,27 29,26.1 29,25 L29,25 Z M27,25.02 L9,25.02 L9,10.97 L27,10.97 L27,25.02 L27,25.02 Z" fill="#fff" fill-rule="evenodd"></path>
          </svg>
        `
        }
      </button>${
        supportsAnchorPositioning
          ? `<div class="ytp-tooltip ytp-bottom">
        <div class="ytp-tooltip-text-wrapper" aria-hidden="true">
          <div class="ytp-tooltip-bottom-text${style == "old" ? " ytp-tooltip-text-no-title" : ""}">
            <span class="ytp-tooltip-text">Miniplayer${style == "old" ? " (i)" : ""}</span>
            ${style == "new" ? '<div class="ytp-tooltip-keyboard-shortcut">I</div>' : ""}
          </div>
        </div>
      </div>`
          : ""
      }`;

    $sizeButton.insertAdjacentHTML("beforebegin", buttonHTML);

    const $button = document.querySelector("#cpfyt-miniplayer-button");

    $button.style.display = "inline-block";

    if (supportsAnchorPositioning) {
      $button.style.anchorName = "--cpfyt-miniplayer-anchor";
    }

    if (!supportsAnchorPositioning) {
      const $tooltip = $button.nextElementSibling;
      if ($tooltip && $tooltip.classList.contains("ytp-tooltip")) {
        $button.addEventListener("mouseenter", () => {
          $tooltip.style.display = "block";
        });
        $button.addEventListener("mouseleave", () => {
          $tooltip.style.display = "none";
        });
      }
    }

    $button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "KeyI",
          key: "i",
          keyCode: 73,
          which: 73,
        }),
      );
    });
  }

  function display_update_win() {
    function btn_click() {
      const btn = this;
      if (btn.id === "go_btn") {
        location.href = script_url;
      }
      container.remove();
    }
    const css_str =
      "#update_tips_win { z-index:9999999999; display: flex; position: fixed; bottom: 20px; right: 20px; padding: 10px 20px; background-color: #fff; border: 1px solid #ccc; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); border-radius: 10px; } .btn { margin: 0 10px; display: inline-block; padding: 5px 10px; background-color: #3498db; color: #fff; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.3s ease; } .btn:hover { background-color: #2980b9; }";
    const style = unsafeWindow.document.createElement("style");
    style.innerText = css_str;
    $("body").appendChild(style);
    const container = unsafeWindow.document.createElement("div");
    container.id = "update_tips_win";
    const span = unsafeWindow.document.createElement("span");
    span.textContent = GM_info.script.name + " has an update!";
    container.appendChild(span);
    const go_btn = unsafeWindow.document.createElement("button");
    go_btn.textContent = "GO";
    go_btn.id = "go_btn";
    go_btn.className = "btn";
    go_btn.onclick = btn_click;
    container.appendChild(go_btn);
    const no_btn = unsafeWindow.document.createElement("button");
    no_btn.textContent = "NO";
    no_btn.className = "btn";
    no_btn.id = "no_btn";
    no_btn.onclick = btn_click;
    container.appendChild(no_btn);
    $("body").appendChild(container);
  }

  function check_update() {
    const script_handler = GM_info.scriptHandler;
    if (["Via"].includes(script_handler)) return;
    const last_check_time = GM_getValue("last_check_time", 0);
    if (Date.now() - last_check_time < 1000 * 60 * 60 * 24) return;
    GM_xmlhttpRequest({
      method: "GET",
      url: script_url,
      onload: function (response) {
        const onlineScript = response.responseText;
        const onlineMeta = onlineScript.match(/@version\s+([^\s]+)/i);
        const onlineVersion = onlineMeta ? onlineMeta[1] : "";
        if (onlineVersion > GM_info.script.version) {
          display_update_win();
        }
      },
    });
    GM_setValue("last_check_time", Date.now());
  }

  function obj_process_filter(path_info, json_obj) {
    if (
      !["yt_home", "yt_watch", "mobile_yt_home", "mobile_yt_watch"].includes(
        page_type,
      )
    )
      return false;
    if (!user_data.login || user_data.channel_infos.ids.length === 0)
      return false;

    if (
      user_data.open_recommend_shorts === "subscribed" &&
      path_info.condition_value === "YOUTUBE_SHORTS_BRAND_24"
    ) {
      if (path_info.express.includes("YOUTUBE_SHORTS_BRAND_24")) {
        let video_list_path;
        video_list_path =
          path_info.conform_value_path.split('["icon"]')[0] +
          (page_type === "yt_home" ? '["contents"]' : '["items"]');
        const video_list =
          data_process.string_to_value(json_obj, video_list_path) || [];
        shorts_fun.node_parse(video_list);
      }
    }

    if (
      user_data.open_recommend_liveroom === "subscribed" &&
      ["UPCOMING", "LIVE", "BADGE_STYLE_TYPE_LIVE_NOW"].includes(
        path_info.condition_value,
      )
    ) {
      if (path_info.express.includes("UPCOMING")) {
        try {
          const match = JSON.stringify(
            data_process.string_to_value(json_obj, path_info.deal_path),
          ).match(/"browseId"\:"(.*?)"/);
          let id;
          if (match && match.length > 1) id = match[1];
          if (!id) {
            log("Failed to get id\n" + JSON.stringify(path_info), -1);
          }
          if (user_data.channel_infos.ids.includes(id)) {
            const index = user_data.channel_infos.ids.indexOf(id);
            const name = user_data.channel_infos.names[index];
            log(
              "Do not filter " +
                name +
                (path_info.condition_value === "UPCOMING"
                  ? " upcoming Live"
                  : " ongoing Live"),
              "shorts",
            );
            return true;
          }
          let msg = `Filtering ${id} ${
            path_info.condition_value === "UPCOMING"
              ? " upcoming Live"
              : " ongoing Live"
          }`;
          log(msg, "shorts");
        } catch (error) {
          log(error, -1);
        }
      }
    }
    return false;
  }

  function get_shorts_fun() {
    class ShortsFun {
      constructor() {
        this.parsing = false;
        this.shorts_list = [];
      }
      node_parse(video_list) {
        !user_data.shorts_list && (user_data.shorts_list = []);
        let video_id, title, views_lable, thumbnail_url;
        let count = 0;
        for (let video_info of video_list) {
          count++;
          if (page_type === "yt_home") {
            video_id =
              video_info.richItemRenderer.content.reelItemRenderer.videoId;
            title =
              video_info.richItemRenderer.content.reelItemRenderer.headline
                .simpleText;
            views_lable =
              video_info.richItemRenderer.content.reelItemRenderer.viewCountText
                .simpleText;
            thumbnail_url =
              video_info.richItemRenderer.content.reelItemRenderer.thumbnail
                .thumbnails[0].url;
          }
          if (page_type === "yt_watch") {
            video_id = video_info.reelItemRenderer.videoId;
            title = video_info.reelItemRenderer.headline.simpleText;
            views_lable = video_info.reelItemRenderer.viewCountText.simpleText;
            thumbnail_url =
              video_info.reelItemRenderer.thumbnail.thumbnails[0].url;
          }
          if (["mobile_yt_home", "mobile_yt_watch"].includes(page_type)) {
            video_id = video_info.shortsLockupViewModel.entityId.replace(
              "shorts-shelf-item-",
              "",
            );
            title =
              video_info.shortsLockupViewModel.overlayMetadata.primaryText
                .content;
            views_lable =
              video_info.shortsLockupViewModel.overlayMetadata.secondaryText
                .content;
            thumbnail_url =
              video_info.shortsLockupViewModel.thumbnail.sources[0].url;
          }
          this.shorts_list.push({
            id: video_id,
            title: title,
            views_lable: views_lable,
            thumbnail_url: thumbnail_url,
          });
          if (!this.parsing) {
            this.parsing = true;
            setTimeout(() => {
              this.parse_shorts_list();
            }, shorts_parse_delay);
          }
        }
      }
      get_shorts_section() {
        if (!user_data.shorts_list || !user_data.shorts_list.length) return;
        let root, item_path;
        const items = [];
        if (page_type == "yt_home") {
          root = {
            richSectionRenderer: {
              content: {
                richShelfRenderer: {
                  title: {
                    runs: [
                      {
                        text: "Shorts",
                      },
                    ],
                  },
                  contents: [],
                  trackingParams: "CNMEEN-DAyITCOGA_NHuz4UDFWdqTAgdfF4E-Q==",
                  menu: {
                    menuRenderer: {
                      trackingParams:
                        "CNMEEN-DAyITCOGA_NHuz4UDFWdqTAgdfF4E-Q==",
                      topLevelButtons: [
                        {
                          buttonRenderer: {
                            style: "STYLE_OPACITY",
                            size: "SIZE_DEFAULT",
                            isDisabled: false,
                            serviceEndpoint: {
                              clickTrackingParams:
                                "CNYEEKqJCRgMIhMI4YD80e7PhQMVZ2pMCB18XgT5",
                              commandMetadata: {
                                webCommandMetadata: {
                                  sendPost: true,
                                  apiUrl: "/youtubei/v1/feedback",
                                },
                              },
                              feedbackEndpoint: {
                                feedbackToken:
                                  "AB9zfpIcTXNyA3lbF_28icb4umRJ5AveSSTqmF7T9gE8k-Sw7HrOTLE5wzA2TScqfTByCI-cR9nPuVMSWAgbNuuaruVBYx2-2dGAzujQTL8KGMOyCFM_wmGhkLTSdUBQzsFQRHEibpg_",
                                uiActions: {
                                  hideEnclosingContainer: true,
                                },
                                actions: [
                                  {
                                    clickTrackingParams:
                                      "CNYEEKqJCRgMIhMI4YD80e7PhQMVZ2pMCB18XgT5",
                                    replaceEnclosingAction: {
                                      item: {
                                        notificationMultiActionRenderer: {
                                          responseText: {
                                            runs: [
                                              {
                                                text: "Shelf will be hidden for ",
                                              },
                                              {
                                                text: "30",
                                              },
                                              {
                                                text: " days",
                                              },
                                            ],
                                          },
                                          buttons: [
                                            {
                                              buttonRenderer: {
                                                style: "STYLE_BLUE_TEXT",
                                                text: {
                                                  simpleText: "Undo",
                                                },
                                                serviceEndpoint: {
                                                  clickTrackingParams:
                                                    "CNgEEPBbGAAiEwjhgPzR7s-FAxVnakwIHXxeBPk=",
                                                  commandMetadata: {
                                                    webCommandMetadata: {
                                                      sendPost: true,
                                                      apiUrl:
                                                        "/youtubei/v1/feedback",
                                                    },
                                                  },
                                                  undoFeedbackEndpoint: {
                                                    undoToken:
                                                      "AB9zfpLpAillN1hH9cyfSbyPRWwAhTOJo6mUTu-ony4HASc0KgCEy0ifaIrDUdJJEk4OXiPC43EMPZBEK8WGiIqeci4r97TGpabAUk84dEh7tHzF7-rsziFBGZjY92Jyk3YujrF2_wxC",
                                                    actions: [
                                                      {
                                                        clickTrackingParams:
                                                          "CNgEEPBbGAAiEwjhgPzR7s-FAxVnakwIHXxeBPk=",
                                                        undoFeedbackAction: {
                                                          hack: true,
                                                        },
                                                      },
                                                    ],
                                                  },
                                                },
                                                trackingParams:
                                                  "CNgEEPBbGAAiEwjhgPzR7s-FAxVnakwIHXxeBPk=",
                                              },
                                            },
                                          ],
                                          trackingParams:
                                            "CNcEEKW8ASITCOGA_NHuz4UDFWdqTAgdfF4E-Q==",
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                            icon: {
                              iconType: "DISMISSAL",
                            },
                            tooltip: "Not interested",
                            trackingParams:
                              "CNYEEKqJCRgMIhMI4YD80e7PhQMVZ2pMCB18XgT5",
                            accessibilityData: {
                              accessibilityData: {
                                label: "Not interested",
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                  showMoreButton: {
                    buttonRenderer: {
                      style: "STYLE_OPACITY",
                      size: "SIZE_DEFAULT",
                      text: {
                        runs: [
                          {
                            text: "Show more",
                          },
                        ],
                      },
                      icon: {
                        iconType: "EXPAND",
                      },
                      accessibility: {
                        label: "Show more",
                      },
                      trackingParams:
                        "CNUEEJnjCyITCOGA_NHuz4UDFWdqTAgdfF4E-Q==",
                    },
                  },
                  isExpanded: false,
                  icon: {
                    iconType: "YOUTUBE_SHORTS_BRAND_24",
                  },
                  isTopDividerHidden: false,
                  isBottomDividerHidden: false,
                  showLessButton: {
                    buttonRenderer: {
                      style: "STYLE_OPACITY",
                      size: "SIZE_DEFAULT",
                      text: {
                        runs: [
                          {
                            text: "Show less",
                          },
                        ],
                      },
                      icon: {
                        iconType: "COLLAPSE",
                      },
                      accessibility: {
                        label: "Show less",
                      },
                      trackingParams: "CNQEEPBbIhMI4YD80e7PhQMVZ2pMCB18XgT5",
                    },
                  },
                },
              },
              trackingParams: "CNIEEOOXBRgEIhMI4YD80e7PhQMVZ2pMCB18XgT5",
              fullBleed: false,
            },
          };
          item_path =
            "root.richSectionRenderer.content.richShelfRenderer.contents";
        }
        if (["mobile_yt_watch", "yt_watch"].includes(page_type)) {
          root = {
            reelShelfRenderer: {
              title: {
                runs: [
                  {
                    text: "Shorts",
                  },
                ],
              },
              items: [],
              trackingParams: "CM4CEN-DAxgEIhMInKOvhY3QhQMVGcCXCB04HQR6",
              icon: {
                iconType: "YOUTUBE_SHORTS_BRAND_24",
              },
            },
          };
          item_path = "root.reelShelfRenderer.items";
        }
        if (page_type == "mobile_yt_home") {
          root = {
            richSectionRenderer: {
              content: {
                reelShelfRenderer: {
                  title: {
                    runs: [
                      {
                        text: "Shorts",
                      },
                    ],
                  },
                  button: {
                    menuRenderer: {
                      trackingParams: "CHYQ34MDIhMIqeqAyo7QhQMVz3lMCB2mCA0J",
                      topLevelButtons: [
                        {
                          buttonRenderer: {
                            style: "STYLE_DEFAULT",
                            size: "SIZE_DEFAULT",
                            isDisabled: false,
                            serviceEndpoint: {
                              clickTrackingParams:
                                "CLMBEKqJCRgPIhMIqeqAyo7QhQMVz3lMCB2mCA0J",
                              commandMetadata: {
                                webCommandMetadata: {
                                  sendPost: true,
                                  apiUrl: "/youtubei/v1/feedback",
                                },
                              },
                              feedbackEndpoint: {
                                feedbackToken:
                                  "AB9zfpJSnrbvskPWkpziyGduKV-4gTxm30-eNNYDobzecpLq84dL6HwCxdX_zbvm_OmxSKdlsngHEE1CF7JKYGiyDVYV_Q7p9ihGCzOYcnqKcAJfNnSp-U-njcnKLgCWu_USr-2prW3x",
                                uiActions: {
                                  hideEnclosingContainer: true,
                                },
                                actions: [
                                  {
                                    clickTrackingParams:
                                      "CLMBEKqJCRgPIhMIqeqAyo7QhQMVz3lMCB2mCA0J",
                                    replaceEnclosingAction: {
                                      item: {
                                        notificationMultiActionRenderer: {
                                          responseText: {
                                            runs: [
                                              {
                                                text: "Shelf will be hidden for ",
                                              },
                                              {
                                                text: "30",
                                              },
                                              {
                                                text: " days",
                                              },
                                            ],
                                          },
                                          buttons: [
                                            {
                                              buttonRenderer: {
                                                style: "STYLE_MONO_TONAL",
                                                text: {
                                                  runs: [
                                                    {
                                                      text: "Undo",
                                                    },
                                                  ],
                                                },
                                                serviceEndpoint: {
                                                  clickTrackingParams:
                                                    "CLUBEPBbGAAiEwip6oDKjtCFAxXPeUwIHaYIDQk=",
                                                  commandMetadata: {
                                                    webCommandMetadata: {
                                                      sendPost: true,
                                                      apiUrl:
                                                        "/youtubei/v1/feedback",
                                                    },
                                                  },
                                                  undoFeedbackEndpoint: {
                                                    undoToken:
                                                      "AB9zfpK-nY3vxgYDkvJSkuFdbeBltD0r4XdLzoFqxz6OPnmJrroOAxKfUuDny8kPjB9yyWzwEerOZqe90BakCPEJXycRSrH8sZAdnlWpEs0n0lx6qOFERE6o5jkK3mgbcVCM-Al38oGV",
                                                    actions: [
                                                      {
                                                        clickTrackingParams:
                                                          "CLUBEPBbGAAiEwip6oDKjtCFAxXPeUwIHaYIDQk=",
                                                        undoFeedbackAction: {
                                                          hack: true,
                                                        },
                                                      },
                                                    ],
                                                  },
                                                },
                                                trackingParams:
                                                  "CLUBEPBbGAAiEwip6oDKjtCFAxXPeUwIHaYIDQk=",
                                              },
                                            },
                                          ],
                                          trackingParams:
                                            "CLQBEKW8ASITCKnqgMqO0IUDFc95TAgdpggNCQ==",
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                            icon: {
                              iconType: "DISMISSAL",
                            },
                            tooltip: "Not interested",
                            trackingParams:
                              "CLMBEKqJCRgPIhMIqeqAyo7QhQMVz3lMCB2mCA0J",
                            accessibilityData: {
                              accessibilityData: {
                                label: "Not interested",
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                  items: [],
                  trackingParams: "CHYQ34MDIhMIqeqAyo7QhQMVz3lMCB2mCA0J",
                  icon: {
                    iconType: "YOUTUBE_SHORTS_BRAND_24",
                  },
                },
              },
              trackingParams: "CHUQ45cFGAEiEwip6oDKjtCFAxXPeUwIHaYIDQk=",
              fullBleed: false,
            },
          };
          item_path =
            "root.richSectionRenderer.content.reelShelfRenderer.items";
        }
        let shorts;
        while ((shorts = user_data.shorts_list.pop())) {
          const id = shorts["id"];
          const title = shorts["title"];
          const ago_str = shorts["ago_str"];
          const author = shorts["author_name"];
          const views_lable =
            shorts["views_lable"] +
            (author ? " · " + author : "") +
            (ago_str ? " · " + ago_str : "");
          const thumbnail_url = shorts["thumbnail_url"];
          let tmp_item;
          if (["yt_home", "yt_watch"].includes(page_type)) {
            tmp_item = {
              reelItemRenderer: {
                videoId: id,
                headline: {
                  simpleText: title,
                },
                thumbnail: {
                  thumbnails: [
                    {
                      url: thumbnail_url,
                      width: 405,
                      height: 720,
                    },
                  ],
                  isOriginalAspectRatio: true,
                },
                viewCountText: {
                  accessibility: {
                    accessibilityData: {
                      label: views_lable,
                    },
                  },
                  simpleText: views_lable,
                },
                navigationEndpoint: {
                  clickTrackingParams:
                    "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6mgEFCCUQ-B0=",
                  commandMetadata: {
                    webCommandMetadata: {
                      url: "/shorts/" + id,
                      webPageType: "WEB_PAGE_TYPE_SHORTS",
                      rootVe: 37414,
                    },
                  },
                  reelWatchEndpoint: {
                    videoId: id,
                    playerParams:
                      "8AEBoAMCyAMluAQGogYVAdXZ-jvMfGWnXiNDPh0oiMSTJMUn",
                    thumbnail: {
                      thumbnails: [
                        {
                          url: "https://i.ytimg.com/vi/" + id + "/frame0.jpg",
                          width: 1080,
                          height: 1920,
                        },
                      ],
                      isOriginalAspectRatio: true,
                    },
                    overlay: {
                      reelPlayerOverlayRenderer: {
                        style: "REEL_PLAYER_OVERLAY_STYLE_SHORTS",
                        trackingParams:
                          "CO4CELC1BCITCJyjr4WN0IUDFRnAlwgdOB0Eeg==",
                        reelPlayerNavigationModel:
                          "REEL_PLAYER_NAVIGATION_MODEL_UNSPECIFIED",
                      },
                    },
                    params: "CAYwAg%3D%3D",
                    sequenceProvider: "REEL_WATCH_SEQUENCE_PROVIDER_RPC",
                    sequenceParams: "CgtLRmRCbnpnSjJZWSoCGAZQGWgA",
                    loggingContext: {
                      vssLoggingContext: {
                        serializedContextData: "CgIIDA%3D%3D",
                      },
                      qoeLoggingContext: {
                        serializedContextData: "CgIIDA%3D%3D",
                      },
                    },
                    ustreamerConfig:
                      "CAwSHDFIakVXUytucVRyTENNWlgzMXdDZmYwamZQQ0U=",
                  },
                },
                menu: {
                  menuRenderer: {
                    items: [
                      {
                        menuServiceItemRenderer: {
                          text: {
                            runs: [
                              {
                                text: "Report",
                              },
                            ],
                          },
                          icon: {
                            iconType: "FLAG",
                          },
                          serviceEndpoint: {
                            clickTrackingParams:
                              "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                            commandMetadata: {
                              webCommandMetadata: {
                                sendPost: true,
                                apiUrl: "/youtubei/v1/flag/get_form",
                              },
                            },
                            getReportFormEndpoint: {
                              params: "EgtLRmRCbnpnSjJZWUABWABwAXgB2AEA6AEA",
                            },
                          },
                          trackingParams:
                            "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                        },
                      },
                      {
                        menuServiceItemRenderer: {
                          text: {
                            runs: [
                              {
                                text: "Not interested",
                              },
                            ],
                          },
                          icon: {
                            iconType: "NOT_INTERESTED",
                          },
                          serviceEndpoint: {
                            clickTrackingParams:
                              "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                            commandMetadata: {
                              webCommandMetadata: {
                                sendPost: true,
                                apiUrl: "/youtubei/v1/feedback",
                              },
                            },
                            feedbackEndpoint: {
                              feedbackToken:
                                "AB9zfpIBjY8nLioWtHjvUvMvrLXfhPMooShdpv91xgNNrZuxibAl6QyPeYMe7faEHcrSUm-TIqvLe2ThmYQpNRUy9rPbV1k3jjrvqqc5cOLBvnV8oN0Kbrq3-K9IjJXYitJPyOzJU0uy",
                              actions: [
                                {
                                  clickTrackingParams:
                                    "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                                  replaceEnclosingAction: {
                                    item: {
                                      notificationMultiActionRenderer: {
                                        responseText: {
                                          runs: [
                                            {
                                              text: "Video removed",
                                            },
                                          ],
                                        },
                                        buttons: [
                                          {
                                            buttonRenderer: {
                                              style: "STYLE_BLUE_TEXT",
                                              text: {
                                                runs: [
                                                  {
                                                    text: "Undo",
                                                  },
                                                ],
                                              },
                                              serviceEndpoint: {
                                                clickTrackingParams:
                                                  "CO0CEPBbGAAiEwico6-FjdCFAxUZwJcIHTgdBHo=",
                                                commandMetadata: {
                                                  webCommandMetadata: {
                                                    sendPost: true,
                                                    apiUrl:
                                                      "/youtubei/v1/feedback",
                                                  },
                                                },
                                                undoFeedbackEndpoint: {
                                                  undoToken:
                                                    "AB9zfpK74nsMbZ4OfNgKTgA9g0w3Q8o72jdm384D3y82OAuy2KgvTUOAn-iII915ZC_7aqAxTK-XNir21X_T3WQEeAzdy4hCZ6o0f12hfdHW8xI1js1WB_CEn3EW27P9_1vu5dw2kDeW",
                                                  actions: [
                                                    {
                                                      clickTrackingParams:
                                                        "CO0CEPBbGAAiEwico6-FjdCFAxUZwJcIHTgdBHo=",
                                                      undoFeedbackAction: {
                                                        hack: true,
                                                      },
                                                    },
                                                  ],
                                                },
                                              },
                                              trackingParams:
                                                "CO0CEPBbGAAiEwico6-FjdCFAxUZwJcIHTgdBHo=",
                                            },
                                          },
                                        ],
                                        trackingParams:
                                          "COwCEKW8ASITCJyjr4WN0IUDFRnAlwgdOB0Eeg==",
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                          },
                          trackingParams:
                            "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                          accessibility: {
                            accessibilityData: {
                              label: "Not interested",
                            },
                          },
                        },
                      },
                      {
                        menuNavigationItemRenderer: {
                          text: {
                            runs: [
                              {
                                text: "Send feedback",
                              },
                            ],
                          },
                          icon: {
                            iconType: "FEEDBACK",
                          },
                          navigationEndpoint: {
                            clickTrackingParams:
                              "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                            commandMetadata: {
                              webCommandMetadata: {
                                ignoreNavigation: true,
                              },
                            },
                            userFeedbackEndpoint: {
                              additionalDatas: [
                                {
                                  userFeedbackEndpointProductSpecificValueData:
                                    {
                                      key: "video_id",
                                      value: id,
                                    },
                                },
                                {
                                  userFeedbackEndpointProductSpecificValueData:
                                    {
                                      key: "lockup",
                                      value: "shelf",
                                    },
                                },
                              ],
                            },
                          },
                          trackingParams:
                            "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                          accessibility: {
                            accessibilityData: {
                              label: "Send feedback",
                            },
                          },
                        },
                      },
                    ],
                    trackingParams: "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                    accessibility: {
                      accessibilityData: {
                        label: "More actions",
                      },
                    },
                  },
                },
                trackingParams:
                  "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6QIazp8Dzs9CrKA==",
                accessibility: {
                  accessibilityData: {
                    label: title + " - play Short",
                  },
                },
                style: "REEL_ITEM_STYLE_AVATAR_CIRCLE",
                dismissalInfo: {
                  feedbackToken:
                    "AB9zfpLIJd1aRU9JzdOjpgeJBW2QvHH79sx6dM6ZCDEzyc5qrISZBSpNRe5lerckNHwQ10BOwEQhlquLlHP-nkuA4VSSCXX0XgMJHBnKWBxlIXkQ1pLIUjd6cQKhrCUioDfix7xn5Ecj",
                },
                videoType: "REEL_VIDEO_TYPE_VIDEO",
                loggingDirectives: {
                  trackingParams: "COsCEIf2BBgAIhMInKOvhY3QhQMVGcCXCB04HQR6",
                  visibility: {
                    types: "12",
                  },
                  enableDisplayloggerExperiment: true,
                },
              },
            };
          }
          if (page_type == "yt_home") {
            tmp_item = {
              richItemRenderer: {
                content: tmp_item,
                trackingParams: "CJsFEJmNBRgAIhMI4YD80e7PhQMVZ2pMCB18XgT5",
              },
            };
          }
          if (["mobile_yt_home", "mobile_yt_watch"].includes(page_type)) {
            tmp_item = {
              shortsLockupViewModel: {
                entityId: "shorts-shelf-item-" + id,
                accessibilityText: title + ", " + views_lable + " - play Short",
                thumbnail: {
                  sources: [
                    {
                      url: thumbnail_url,
                      width: 405,
                      height: 720,
                    },
                  ],
                },
                onTap: {
                  innertubeCommand: {
                    clickTrackingParams:
                      "CK8BEIf2BBgAIhMIqeqAyo7QhQMVz3lMCB2mCA0JWg9GRXdoYXRfdG9fdG9wYXRjaJoBBQgkEI4e",
                    commandMetadata: {
                      webCommandMetadata: {
                        url: "/shorts/" + id,
                        webPageType: "WEB_PAGE_TYPE_SHORTS",
                        rootVe: 37414,
                      },
                    },
                    reelWatchEndpoint: {
                      videoId: id,
                    },
                  },
                },
                overlayMetadata: {
                  primaryText: {
                    content: title,
                  },
                  secondaryText: {
                    content: views_lable,
                  },
                },
              },
            };
          }
          items.push(tmp_item);
        }
        if (item_path) {
          eval(trustedScript(item_path + " = items"));
          user_data_api.set();
          return root;
        }
        return {};
      }
      get_shorts_info(video_id) {
        return new Promise((resolve, reject) => {
          let basic_url, author_id_reg, author_name_reg, ago_reg;
          if (page_type.startsWith("mobile")) {
            basic_url = "https://m.youtube.com/shorts/";
            author_id_reg = /"channelId":"(.*?)"/;
            author_name_reg = /"ownerChannelName":"(.*?)"/;
            ago_reg = /timestampText.*?:\\x22(.*?)\\x22\\x7d/;
          } else {
            basic_url = "https://www.youtube.com/shorts/";
            author_id_reg = /"browseId":"([a-zA-Z0-9\-_]+)","canonicalBaseUrl"/;
            author_name_reg = /"channel":\{"simpleText":"(.*?)"/;
            ago_reg = /"timestampText":{"simpleText":"(.*?)"}/;
          }
          const url = basic_url + video_id;
          const xhr = new XMLHttpRequest();
          xhr.open("GET", url);
          xhr.setRequestHeader(
            "accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          );
          let author_id = "";
          let author_name = "";
          let ago_str = "";
          xhr.onload = function () {
            if (xhr.status === 200) {
              let match;
              const result = xhr.responseText;
              match = result.match(author_id_reg);
              if (match && match.length > 1) author_id = match[1];
              match = result.match(author_name_reg);
              if (match && match.length > 1) author_name = match[1];
              match = result.match(ago_reg);
              if (match && match.length > 1) ago_str = match[1];
              resolve({
                id: video_id,
                author_id: author_id,
                author_name: author_name,
                ago_str: ago_str,
              });
            } else {
              reject(xhr.responseText);
            }
          };
          xhr.onerror = function () {
            reject(new Error("XHR request failed"));
          };
          xhr.send();
        });
      }
      parse_shorts_list() {
        if (!this.shorts_list.length) return;
        const { id, title, views_lable, thumbnail_url } =
          this.shorts_list.pop();
        this.get_shorts_info(id)
          .then((author_info) => {
            const { author_id, author_name, ago_str } = author_info;
            if (author_id && user_data.channel_infos.ids.includes(author_id)) {
              if (
                user_data.shorts_list.some((value) => {
                  return value.id === id;
                })
              ) {
                log(
                  "Already exists from " + author_name + ": " + title,
                  "shorts",
                );
              } else {
                log(
                  "Not filtering " + author_name + "'s short: " + title,
                  "shorts",
                );
                const shorts_info = {
                  id: id,
                  title: title,
                  author_id: author_id,
                  author_name: author_name,
                  views_lable: views_lable,
                  from: page_type,
                  thumbnail_url: thumbnail_url,
                  ago_str: ago_str,
                };
                user_data.shorts_list.push(shorts_info);
                user_data_api.set();
              }
            } else {
              log("Filtering " + author_name + "'s short: " + title, "shorts");
            }
          })
          .finally(() => {
            if (this.shorts_list.length > 0)
              setTimeout(() => {
                this.parse_shorts_list();
              }, shorts_parse_delay);
            else this.parsing = false;
          });
      }
      check_shorts_exist() {
        const short_id = href.split("/").pop();
        for (let i = 0; i < user_data.shorts_list.length; i++) {
          if (user_data.shorts_list[i].id === short_id) {
            user_data.shorts_list.splice(i, 1);
            user_data_api.set();
            return;
          }
        }
      }
      get_interval_tag(upload_date_str) {
        if (!upload_date_str) return "";
        const uploadDate = new Date(upload_date_str);
        const currentDate = new Date();
        const timeDifference = Math.abs(currentDate - uploadDate);
        const secondsDifference = timeDifference / 1000;
        const minutesDifference = secondsDifference / 60;
        const hoursDifference = minutesDifference / 60;
        const daysDifference = hoursDifference / 24;
        const weeksDifference = daysDifference / 7;
        const monthsDifference = weeksDifference / 4.345;
        const yearsDifference = monthsDifference / 12;
        if (secondsDifference < 60) {
          return `${Math.floor(secondsDifference)} seconds ago`;
        } else if (minutesDifference < 60) {
          return `${Math.floor(minutesDifference)} minutes ago`;
        } else if (hoursDifference < 24) {
          return `${Math.floor(hoursDifference)} hours ago`;
        } else if (daysDifference < 7) {
          return `${Math.floor(daysDifference)} days ago`;
        } else if (weeksDifference < 4.345) {
          return `${Math.floor(weeksDifference)} weeks ago`;
        } else if (monthsDifference < 12) {
          return `${Math.floor(monthsDifference)} months ago`;
        } else {
          return `${Math.floor(yearsDifference)} years ago`;
        }
      }
    }
    return new ShortsFun();
  }

  function get_yt_api() {
    return {
      get_subscribe_data: function (retry = 0) {
        const headers = {
          authority: "www.youtube.com",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        };
        const url = "https://www.youtube.com/feed/channels";
        const requestConfig = {
          method: "GET",
          headers: headers,
          url: url,
        };
        const save_this = this;
        GM_xmlhttpRequest({
          ...requestConfig,
          onload: function (response) {
            const tmp_channel_names = [];
            const tmp_channel_ids = [];
            const regex = /var ytInitialData \= (.*?);\<\/script\>/;
            try {
              const match = response.responseText.match(regex);
              const ytInitialData_obj = JSON.parse(match[1]);
              const items =
                ytInitialData_obj.contents.twoColumnBrowseResultsRenderer
                  .tabs[0].tabRenderer.content.sectionListRenderer.contents[0]
                  .itemSectionRenderer.contents[0].shelfRenderer.content
                  .expandedShelfContentsRenderer.items;
              for (let item of items) {
                const channel_name = item.channelRenderer.title.simpleText;
                const match_channel_id = item.channelRenderer.channelId;
                tmp_channel_ids.push(match_channel_id);
                tmp_channel_names.push(channel_name);
              }
              if (tmp_channel_ids.length > 0) {
                user_data.channel_infos.ids = tmp_channel_ids;
                user_data.channel_infos.names = tmp_channel_names;
                user_data_api.set();
              }
              log(
                "Fetched subscription list successfully: " +
                  user_data.channel_infos.ids.length +
                  " channels",
                0,
              );
            } catch (error) {
              if (retry < 3) {
                setTimeout(() => {
                  save_this.get_subscribe_data(retry + 1);
                }, 1000);
              }
              log("Failed to fetch subscription list\n", error, -1);
            }
          },
          onerror: function (error) {
            if (retry < 3) {
              setTimeout(() => {
                save_this.get_subscribe_data(retry + 1);
              }, 1000);
            }
            log("Failed to fetch subscription list\n", error, -1);
          },
        });
      },
      get_authorization: function () {
        function Vja() {
          function a() {
            e[0] = 1732584193;
            e[1] = 4023233417;
            e[2] = 2562383102;
            e[3] = 271733878;
            e[4] = 3285377520;
            u = q = 0;
          }
          function b(x) {
            for (var y = l, C = 0; 64 > C; C += 4)
              y[C / 4] =
                (x[C] << 24) | (x[C + 1] << 16) | (x[C + 2] << 8) | x[C + 3];
            for (C = 16; 80 > C; C++)
              ((x = y[C - 3] ^ y[C - 8] ^ y[C - 14] ^ y[C - 16]),
                (y[C] = ((x << 1) | (x >>> 31)) & 4294967295));
            x = e[0];
            var E = e[1],
              H = e[2],
              R = e[3],
              T = e[4];
            for (C = 0; 80 > C; C++) {
              if (40 > C) {
                if (20 > C) {
                  var X = R ^ (E & (H ^ R));
                  var la = 1518500249;
                } else ((X = E ^ H ^ R), (la = 1859775393));
              } else
                60 > C
                  ? ((X = (E & H) | (R & (E | H))), (la = 2400959708))
                  : ((X = E ^ H ^ R), (la = 3395469782));
              X =
                ((((x << 5) | (x >>> 27)) & 4294967295) + X + T + la + y[C]) &
                4294967295;
              T = R;
              R = H;
              H = ((E << 30) | (E >>> 2)) & 4294967295;
              E = x;
              x = X;
            }
            e[0] = (e[0] + x) & 4294967295;
            e[1] = (e[1] + E) & 4294967295;
            e[2] = (e[2] + H) & 4294967295;
            e[3] = (e[3] + R) & 4294967295;
            e[4] = (e[4] + T) & 4294967295;
            u = q = 0;
          }
          function c(x, y) {
            if ("string" === typeof x) {
              x = unescape(encodeURIComponent(x));
              for (var C = [], E = 0, H = x.length; E < H; ++E)
                C.push(x.charCodeAt(E));
              x = C;
            }
            y || (y = x.length);
            C = 0;
            if (0 == q)
              for (; C + 64 < y; )
                (b(x.slice(C, C + 64)), (C += 64), (u += 64));
            for (; C < y; )
              if (((h[q++] = x[C++]), u++, 64 == q))
                for (q = 0, b(h); C + 64 < y; )
                  (b(x.slice(C, C + 64)), (C += 64), (u += 64));
          }
          function d() {
            var x = [],
              y = 8 * u;
            56 > q ? c(m, 56 - q) : c(m, 64 - (q - 56));
            for (var C = 63; 56 <= C; C--) ((h[C] = y & 255), (y >>>= 8));
            b(h);
            for (C = y = 0; 5 > C; C++)
              for (var E = 24; 0 <= E; E -= 8) x[y++] = (e[C] >> E) & 255;
            return x;
          }
          for (var e = [], h = [], l = [], m = [128], p = 1; 64 > p; ++p)
            m[p] = 0;
          var q, u;
          a();
          return {
            reset: a,
            update: c,
            digest: d,
            digestString: function () {
              for (var x = d(), y = "", C = 0; C < x.length; C++)
                y +=
                  "0123456789ABCDEF".charAt(Math.floor(x[C] / 16)) +
                  "0123456789ABCDEF".charAt(x[C] % 16);
              return y;
            },
          };
        }
        const sapisid_cookie =
          getCookie("SAPISID") ||
          getCookie("APISID") ||
          getCookie("__Secure-3PAPISID");
        if (sapisid_cookie) {
          const timestamp = Math.floor(Date.now() / 1000);
          const b = Vja();
          b.update(
            timestamp + " " + sapisid_cookie + " https://www.youtube.com",
          );
          const hash_value = b.digestString().toLowerCase();
          return "SAPISIDHASH " + timestamp + "_" + hash_value;
        }
        return "";
      },
      get_channel_id: function (retry = 0) {
        const authorization = this.get_authorization();
        if (!authorization) {
          log("Failed to get authorization", 0);
          return;
        }
        const url = "https://www.youtube.com/youtubei/v1/account/account_menu";
        const params = {
          prettyPrint: "false",
        };
        const data = {
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240308.00.00",
            },
          },
        };
        const jsonData = JSON.stringify(data);
        const headers = {
          authorization: authorization,
          "content-type": "application/json",
          origin: "https://www.youtube.com",
          referer: "https0://www.youtube.com/",
        };
        const requestConfig = {
          method: "POST",
          headers: headers,
          data: jsonData,
          url: url + "?" + new URLSearchParams(params),
        };

        GM_xmlhttpRequest({
          ...requestConfig,
          onload: function (response) {
            const match = response.responseText.match(/"browseId"\:"(.*?)"/);
            if (match && match.length > 1) {
              const tmp_id = match[1];
              if (tmp_id && tmp_id != channel_id) {
                channel_id = tmp_id;
                user_data = user_data_api.get();
                GM_setValue("last_channel_id", channel_id);
              }
              log("Successfully obtained channel_id " + channel_id, 0);
            } else {
              if (retry < 3) {
                setTimeout(() => {
                  yt_api.get_channel_id(retry + 1);
                }, 500);
              } else {
                log(
                  "Failed to get channel_id",
                  response,
                  response.responseText,
                  -1,
                );
              }
            }
          },
          onerror: function (error) {
            if (retry < 3) {
              setTimeout(() => {
                yt_api.get_channel_id(retry + 1);
              }, 500);
              yt_api.get_channel_id(retry + 1);
            } else {
              log("Failed to get channel_id", error, 0);
            }
          },
        });
      },
    };
  }

  function get_user_data_api() {
    return {
      get() {
        const default_user_data = {
          open_recommend_shorts: "off",
          open_recommend_movie: "off",
          open_recommend_popular: "off",
          open_recommend_liveroom: "on",
          open_recommend_playables: "off",
          add_shorts_upload_date: "on",
          shorts_change_author_name: "on",
          short_buy_super_thanks: "off",
          shorts_auto_scroll: "off",
          shorts_add_video_progress: "onTap",
          shorts_dbclick_like: "off",
          shorts_disable_loop_play: "on",
          sponsorblock: "on",
          duplicate_song_prevention: "off",
          disable_play_on_hover: "off",
          default_quality: "hd1080",
          default_speed: "1",
          restore_related_sidebar_layout: "on",
          language: "en",
          channel_infos: {
            ids: [],
            names: [],
          },
          shorts_list: [],
          watch_page_config: {
            shop_banner: "off",
            hide_live_chat: "on",
            hide_live_chat_replay: "on",
          },
          global_shorts_block: "on",
          hide_share_button: "off",
          hide_thanks_button: "off",
          hide_clip_button: "off",
          hide_more_actions_button: "off",
          hide_save_button: "off",
          hide_subscribe_button: "off",
          hide_like_bar: "off",
          hide_join_button: "off",
          hide_ask_button: "off",
          hide_download_button: "off",
          hide_end_cards: "off",
          hide_fullscreen_controls: "off",
          hide_ai_summary: "off",
          hide_microphone_icon: "off",
          hide_paid_promotion: "off",
          show_full_video_title: "off",
          hide_grid_avatar: "off",
          hide_views: "off",
          hide_thumbnail_badges: "off",
          disable_saturated_hover: "off",
          old_player_ui: "off",
          restore_red_progress_bar: "on",
          premium_logo: "on",
          search_thumbnail_small: "on",
          dark_mode: "auto",
          popup_positions: {},
          sb_categories: {
            sponsor: "on",
            intro: "on",
            outro: "on",
            selfpromo: "on",
            interaction: "on",
            music_offtopic: "on",
          },
          login: false,
          grid_content_per_row: 3,
          grid_news_per_row: 3,
          grid_shorts_per_row: 3,
        };
        let diff = false;
        user_data_listener.set();
        let tmp_user_data = GM_getValue(channel_id);
        if (!tmp_user_data) {
          tmp_user_data = default_user_data;
          diff = true;
        }
        for (let key in default_user_data) {
          if (!(key in tmp_user_data)) {
            diff = true;
            tmp_user_data[key] = default_user_data[key];
          }
        }
        const tmp_login = channel_id !== "default";
        if (tmp_user_data.login !== tmp_login) {
          diff = true;
          tmp_user_data.login = tmp_login;
        }
        (diff || this.update(tmp_user_data)) &&
          GM_setValue(channel_id, tmp_user_data);
        return tmp_user_data;
      },
      set() {
        return GM_setValue(channel_id, user_data);
      },
      reset() {
        if (!confirm(flag_info.del_config_confirm_tips)) return;
        const keys = GM_listValues();
        for (let key of keys) {
          GM_deleteValue(key);
        }
        unsafeWindow.document.location.reload();
      },
      update(tmp_user_data) {
        let diff = false;
        const last_version = GM_getValue("last_version", -1);
        if (last_version === -1 && !tmp_user_data.open_recommend_shorts) {
          tmp_user_data.open_recommend_shorts = GM_getValue(
            "open_recommend_shorts",
            "on",
          );
          tmp_user_data.open_recommend_movie = GM_getValue(
            "open_recommend_movie",
            "on",
          );
          tmp_user_data.open_recommend_popular = GM_getValue(
            "open_recommend_popular",
            "on",
          );
          tmp_user_data.open_recommend_liveroom = GM_getValue(
            "open_recommend_liveroom",
            "on",
          );
          diff = true;
        }
        if (typeof tmp_user_data.open_recommend_shorts === "boolean") {
          tmp_user_data.open_recommend_shorts =
            tmp_user_data.open_recommend_shorts ? "on" : "off";
          tmp_user_data.open_recommend_movie =
            tmp_user_data.open_recommend_movie ? "on" : "off";
          tmp_user_data.open_recommend_popular =
            tmp_user_data.open_recommend_popular ? "on" : "off";
          tmp_user_data.open_recommend_liveroom =
            tmp_user_data.open_recommend_liveroom ? "on" : "off";
          diff = true;
        }
        last_version !== GM_info.script.version &&
          GM_setValue("last_version", GM_info.script.version);

        if (!tmp_user_data.watch_page_config) {
          tmp_user_data.watch_page_config = {
            shop_banner: "off",
            hide_live_chat: "off",
            hide_live_chat_replay: "off",
          };
          diff = true;
        } else {
          if (tmp_user_data.watch_page_config.hide_live_chat === undefined) {
            tmp_user_data.watch_page_config.hide_live_chat = "off";
            diff = true;
          }
          if (
            tmp_user_data.watch_page_config.hide_live_chat_replay === undefined
          ) {
            tmp_user_data.watch_page_config.hide_live_chat_replay = "off";
            diff = true;
          }
        }

        const newHideKeys = [
          "hide_share_button",
          "hide_thanks_button",
          "hide_clip_button",
          "hide_more_actions_button",
          "hide_save_button",
          "hide_subscribe_button",
          "hide_like_bar",
          "hide_join_button",
          "hide_ask_button",
          "hide_download_button",
          "global_shorts_block",
          "dark_mode",
          "old_player_ui",
        ];
        for (const key of newHideKeys) {
          if (key === "dark_mode" && tmp_user_data[key] === undefined) {
            tmp_user_data[key] = "auto";
            diff = true;
          } else if (key !== "dark_mode" && tmp_user_data[key] === undefined) {
            tmp_user_data[key] = "off";
            diff = true;
          }
        }

        if (!tmp_user_data.popup_positions) {
          tmp_user_data.popup_positions = {};
          diff = true;
        }

        if (!tmp_user_data.sb_categories) {
          tmp_user_data.sb_categories = {
            sponsor: "on",
            intro: "on",
            outro: "on",
            selfpromo: "on",
            interaction: "on",
            music_offtopic: "on",
          };
          diff = true;
        } else {
          const defaults = ["sponsor", "intro", "outro", "selfpromo", "interaction", "music_offtopic"];
          for (const cat of defaults) {
            if (tmp_user_data.sb_categories[cat] === undefined) {
              tmp_user_data.sb_categories[cat] = "on";
              diff = true;
            }
          }
        }

        return diff;
      },
    };
  }

  function get_data_process() {
    class DATA_PROCESS {
      constructor() {
        this.limit_eval = false;
        this.obj_filter;
        this.obj_storage = {};
      }
      condition_split_and_tag = "&&";
      condition_split_or_tag = "||";
      value_split_and_tag = "&";
      value_split_or_tag = "|";

      storage_obj(key, obj) {
        this.obj_storage[key] = obj;
      }

      set_obj_filter(obj_filter) {
        if (typeof obj_filter !== "function") return;
        this.obj_filter = function () {
          try {
            obj_filter.apply(this, arguments);
          } catch (error) {
            log("obj_filter error", error, -1);
            return false;
          }
        };
      }

      text_process(data, values, mode, traverse_all) {
        if (!values) return data;
        const origin_data = data;
        try {
          mode = mode || "cover";
          if (mode === "reg") {
            for (let value of values) {
              const patten_express = value.split(SPLIT_TAG)[0];
              const replace_value = value.split(SPLIT_TAG)[1];
              const patten = new RegExp(patten_express, "g");
              data = data.replace(patten, replace_value);
            }
          }
          if (mode === "cover") {
            data = values[0];
          }
          if (mode === "insert") {
            traverse_all = traverse_all || false;
            let json_data;
            try {
              json_data = JSON.parse(data);
            } catch (error) {
              log("text_process JSON parse error", -1);
              return data;
            }
            this.obj_process(json_data, values, traverse_all);
            data = JSON.stringify(json_data);
          }
        } catch (error) {
          log("text_process error", error, -1);
          data = origin_data;
        }
        return data;
      }

      get_relative_path(basic_path, relative_path) {
        if (relative_path === "/") return basic_path;
        let real_path;
        if (relative_path.startsWith("/.")) {
          real_path = basic_path + relative_path.slice(1);
        }
        if (relative_path.startsWith(".")) {
          const reg = /[\.\[]/g;
          const positions = [];
          let match;
          while ((match = reg.exec(basic_path)) !== null) {
            positions.push(match.index);
          }
          if (positions.length === 0) {
            return basic_path;
          }
          const pointer_match = relative_path.match(/^\.+/);
          const split_index =
            positions[positions.length - pointer_match[0].length];
          const relative_attribute = relative_path.slice(
            pointer_match[0].length,
          );
          real_path =
            basic_path.slice(0, split_index) +
            (relative_attribute
              ? (relative_attribute.startsWith("[") ? "" : ".") +
                relative_attribute
              : "");
        }
        return this.convertPathToBracketNotation(real_path);
      }

      value_parse(parse_value, path_info = null, json_obj = null) {
        const formula_match = parse_value.match(/\{.*?\}/g);
        if (formula_match) {
          for (let express_ of formula_match) {
            const express = express_.slice(1, -1);
            if (!express) continue;
            parse_value = parse_value.replace(
              express_,
              this.value_parse(express, path_info, json_obj),
            );
          }
        }
        const json_math = parse_value.match(/^json\((.*)\)$/);
        if (json_math) return JSON.parse(json_math[1]);
        const obj_match = parse_value.match(/^obj\((.*)\)$/);
        if (obj_match) return this.string_to_value(unsafeWindow, obj_match[1]);
        const storage_obj_match = parse_value.match(/^sobj\((.*)\)$/);
        if (storage_obj_match)
          return this.string_to_value(this.obj_storage, storage_obj_match[1]);
        const number_match = parse_value.match(/^num\((.*)\)$/);
        if (number_match) return Number(number_match[1]);
        const method_match = parse_value.match(/^method\((.*)\)$/);
        if (method_match) {
          if (this.limit_eval) {
            const method_info = method_match[1].match(/(.*?)\((.*)\)$/);
            const method_name = method_info[1];
            const method_args_string = method_info[2];
            const method_args = method_args_string.split(",");
            const args = [];
            for (let arg of method_args) {
              args.push(this.value_parse(arg, path_info, json_obj));
            }
            return unsafeWindow[method_name](...args);
          }
          return eval(trustedScript(method_match[1]));
        }
        const deal_obj_match = parse_value.match(/^dealObj\((.*)\)$/);
        if (deal_obj_match) {
          const path_msg = deal_obj_match[1];
          return this.string_to_value(
            json_obj.this.get_relative_path(path_info.deal_path, path_msg),
          );
        }
        const path_obj_match = parse_value.match(/^pathObj\((.*)\)$/);
        if (path_obj_match) {
          const path_msg = path_obj_match[1];
          return this.string_to_value(
            json_obj,
            this.get_relative_path(path_info.path, path_msg),
          );
        }
        const abs_obj_match = parse_value.match(/^absObj\((.*)\)$/);
        if (abs_obj_match) {
          const abs_path = abs_obj_match[1];
          return this.string_to_value(json_obj, abs_path);
        }
        const string_match = parse_value.match(/^["'](.*)["']$/);
        if (string_match) return string_match[1];
        if (parse_value === "undefined") return undefined;
        if (parse_value === "null") return null;
        return parse_value;
      }

      string_to_value(obj, path) {
        try {
          if (!this.limit_eval) {
            return eval(trustedScript(path.replace("json_obj", "obj")));
          }
          let tmp_obj = obj;
          let matches = path.match(/\[(.*?)\]/g);
          if (matches) {
            matches.map((match) => {
              if (match.includes('["')) {
                tmp_obj = Reflect.get(tmp_obj, match.replace(/\["|"\]/g, ""));
              } else {
                tmp_obj = Reflect.get(
                  tmp_obj,
                  Number(match.replace(/\[|\]/g, "")),
                );
              }
            });
            return tmp_obj;
          }
          matches = path.split(".");
          if (matches) {
            matches.splice(0, 1);
            matches.map((match) => {
              tmp_obj = Reflect.get(tmp_obj, match);
            });
            return tmp_obj;
          }
        } catch (error) {
          return null;
        }
      }

      get_lastPath_and_key(path) {
        let last_path, last_key;
        let matches = path.match(/\[(.*?)\]/g);
        if (matches && matches.length > 0) {
          const tmp = matches[matches.length - 1];
          if (tmp.includes('["')) {
            last_key = tmp.replace(/\["|"\]/g, "");
          } else {
            last_key = Number(tmp.replace(/\[|\]/g, ""));
          }
          last_path = path.substring(0, path.lastIndexOf(tmp));
        }
        if (!matches) {
          matches = path.split(".");
          if (matches && matches.length > 0) {
            last_key = matches[matches.length - 1];
            last_path = path.replace("." + last_key, "");
          }
        }
        return [last_path, last_key];
      }

      convertPathToBracketNotation(path) {
        if (!path) return "";
        return path.replace(/\.[\d\w\-\_\$@]+/g, function (match) {
          return '["' + match.slice(1) + '"]';
        });
      }

      paths_sort(paths_arr, key_name = null, reverse = false) {
        if (!Array.isArray(paths_arr)) {
          throw new Error("paths_arr must be an array");
        }
        if (paths_arr.length === 0) return;
        let tmp_paths_arr = paths_arr;
        if (!key_name) {
          key_name = "path";
          if (typeof paths_arr[0] !== "string")
            throw new Error("paths_arr must be a string array");
          tmp_paths_arr = [];
          paths_arr.forEach((path) => {
            tmp_paths_arr.push({
              path: path,
            });
          });
        }
        const reverse_factor = reverse ? -1 : 1;
        tmp_paths_arr.sort((a, b) => {
          function get_sort_key(obj) {
            if (!obj.sort_keys) {
              const reg = /\["?(.*?)"?\]/g;
              let matches = [];
              let match;
              while ((match = reg.exec(obj[key_name]))) {
                if (!match[0].startsWith('["')) {
                  if (isNaN(match[1]))
                    throw new Error("array index must be a number");
                  match[1] = parseInt(match[1]);
                }
                matches.push(match[1]);
              }
              obj.sort_keys = matches;
            }
          }
          if (a[key_name] === b[key_name]) return 0;
          get_sort_key(a);
          get_sort_key(b);
          const a_sort_keys = a.sort_keys;
          const b_sort_keys = b.sort_keys;
          if (a_sort_keys.length !== b_sort_keys.length) {
            return (b_sort_keys.length - a_sort_keys.length) * reverse_factor;
          }
          for (let i = 0; i < a_sort_keys.length; i++) {
            if (a_sort_keys[i] !== b_sort_keys[i]) {
              return (
                (b_sort_keys[i] > a_sort_keys[i] ? 1 : -1) * reverse_factor
              );
            }
          }
          return 0;
        });
        if (paths_arr !== tmp_paths_arr) {
          paths_arr.length = 0;
          tmp_paths_arr.forEach((path_info) => {
            paths_arr.push(path_info.path);
          });
        }
      }

      obj_process(json_obj, express_list, traverse_all = false) {
        if (typeof json_obj !== "object") {
          log("obj_process target is not an object", express_list, -1);
          return;
        }
        if (typeof express_list === "function") {
          try {
            express_list = express_list(json_obj);
            if (
              !express_list ||
              (Array.isArray(express_list) && express_list.length === 0)
            )
              return;
          } catch (error) {
            log("obj_process express_list function execution error", error, -1);
            return;
          }
        }
        const data_this = this;
        const abs_path_info_list = [];
        const relative_path_info_list = [];
        const relative_path_list = [];
        const relative_short_path_list = [];
        if (!json_obj || !express_list) return;
        const is_array_obj = Array.isArray(json_obj);
        try {
          express_list.forEach((express) => {
            if (!express) return;
            let reg;
            const express_type = typeof express;
            let matches;
            let conditions;
            reg =
              /^(abs:)?(.*?)(=\-|~=|=\+|=)(\(?([^ ][\s\S]*?)\)?)?( ([\s\S]*))?$/;
            if (express_type === "string") {
              matches = express.match(reg);
            } else {
              matches = express.value.match(reg);
              conditions = express.conditions;
            }
            const abs = matches[1];
            let path = matches[2];
            const operator = matches[3];
            let value = matches[4];
            const condition = matches[7];
            const path_extral_match = path.match(/\/\..*$|\.+$|\.\(.*$/);
            let path_extral;
            if (path_extral_match) {
              path_extral = path_extral_match[0];
              path = path.replace(path_extral, "");
            }
            let value_mode;
            if (express_type === "string") {
              const mode_match = value?.match(/^\((.*)\)$/);
              if (mode_match) {
                const mode_info = mode_match[1].split(",");
                value = mode_info[1];
                const mode = mode_info[0];
                mode_info.shift();
                mode_info.shift();
                value_mode = {
                  mode: mode,
                  params: mode_info,
                };
              }
              if (condition) {
                const tmp_conditions = condition
                  ? condition.split(this.condition_split_and_tag)
                  : [];
                conditions = {};
                for (let index = 0; index < tmp_conditions.length; index++) {
                  conditions["value" + index] = tmp_conditions[index].split(
                    this.condition_split_or_tag,
                  );
                }
              }
            }
            matches = path.match(/\[([\*\d\-,]*)\]$/);
            let array_index;
            if (matches) {
              path = path.replace(/\[([\*\d\-,]*)\]$/, "");
              array_index = matches[1];
            }
            if (abs) {
              add_data_to_abs_path({
                path: `json_obj${is_array_obj ? "" : "."}` + path,
                express: express,
                relative_path: path,
                operator: operator,
                value: value,
                condition: conditions,
                array_index: array_index,
                path_extral: path_extral,
                value_mode: value_mode,
              });
            } else {
              relative_path_list.push(path);
              const tmp_short_path = path.split(".").pop();
              relative_short_path_list.push(tmp_short_path);
              relative_path_info_list.push({
                express: express,
                path: path,
                operator: operator,
                value: value,
                value_mode: value_mode,
                conditions: conditions,
                array_index: array_index,
                path_extral: path_extral,
              });
            }
          });
          if (relative_path_list.length > 0) {
            const dec_list = [];
            const dec_index_list = [];
            obj_property_traverse(
              json_obj,
              "",
              {
                short_keys: relative_short_path_list,
                real_keys: relative_path_list,
              },
              dec_list,
              dec_index_list,
              traverse_all,
            );
            for (let i = 0; i < dec_index_list.length; i++) {
              const real_index = dec_index_list[i];
              const real_path_info = relative_path_info_list[real_index];
              const tmp_path = "json_obj" + dec_list[i];
              add_data_to_abs_path({
                path: tmp_path,
                express: real_path_info.express,
                relative_path: real_path_info.path,
                operator: real_path_info.operator,
                value: real_path_info.value,
                condition: real_path_info.conditions,
                array_index: real_path_info.array_index,
                path_extral: real_path_info.path_extral,
                value_mode: real_path_info.value_mode,
              });
            }
          }
          try {
            this.paths_sort(abs_path_info_list, "deal_path");
          } catch (error) {
            abs_path_info_list.sort((a, b) => (a < b ? 1 : -1));
          }
          for (let path_info of abs_path_info_list) {
            if (!this.obj_conditional(path_info, json_obj)) continue;
            if (this.obj_filter && this.obj_filter(path_info, json_obj))
              continue;
            obj_modify(json_obj, path_info);
          }
        } catch (error) {
          log("obj_process processing failed", error, -1);
        }

        function add_data_to_abs_path(params) {
          let {
            path,
            express,
            relative_path,
            operator,
            value,
            condition,
            array_index,
            path_extral,
            value_mode,
          } = params;
          let tmp;
          path = data_this.convertPathToBracketNotation(path);
          if (array_index === undefined) {
            tmp = {};
            path = path;
            tmp.path = path;
            tmp.relative_path = relative_path;
            tmp.operator = operator;
            tmp.value = value;
            tmp.value_mode = value_mode;
            tmp.condition = condition;
            tmp.path_extral = path_extral;
            tmp.express = express;
            add_path(tmp);
            return;
          }
          let array_index_list = [];
          if (array_index === "*") {
            let array_length;
            try {
              array_length =
                data_this.string_to_value(json_obj, path)?.length || 0;
              if (!array_length) return;
            } catch (error) {
              log(
                "obj_process failed to get array length --->" + path,
                error,
                -1,
              );
              return;
            }
            array_index_list = Array.from(
              { length: array_length },
              (_, i) => i,
            );
          } else if (array_index.includes(",")) {
            let is_error = false;
            array_index_list = array_index.split(",").map((item) => {
              if (is_error) return;
              if (isNaN(item)) {
                is_error = true;
                return;
              }
              return Number(item);
            });
            if (is_error) {
              return log(
                "obj_process array index format error --->" + path,
                -1,
              );
            }
          } else if (array_index.includes("-")) {
            const index_arr = array_index.split("-");
            if (index_arr.length !== 2)
              return log(
                "obj_process array index format error --->" + path,
                -1,
              );
            const start = Number(index_arr[0]);
            const end = Number(index_arr[1]);
            if (isNaN(start) || isNaN(end)) {
              return log(
                "obj_process array index format error --->" + path,
                -1,
              );
            }
            array_index_list = Array.from(
              { length: end - start + 1 },
              (_, i) => start + i,
            );
          } else if (!isNaN(array_index)) {
            array_index_list = [array_index];
          } else {
            return log("obj_process array index format error --->" + path, -1);
          }
          for (
            let tmp_index = array_index_list.length - 1;
            tmp_index >= 0;
            tmp_index--
          ) {
            tmp = {};
            tmp.path = path + "[" + array_index_list[tmp_index] + "]";
            tmp.operator = operator;
            tmp.value = value;
            tmp.value_mode = value_mode;
            tmp.condition = condition;
            tmp.path_extral = path_extral;
            tmp.relative_path = relative_path;
            tmp.express = express;
            add_path(tmp);
          }
          function add_path(path_info) {
            path_info.deal_path = path_extral
              ? data_this.get_relative_path(path, path_extral)
              : path_info.path;
            abs_path_info_list.push(path_info);
          }
        }

        function obj_property_traverse(
          obj,
          cur_path,
          dec_infos,
          dec_list,
          dec_index_list,
          traverse_all = false,
        ) {
          if (Array.isArray(obj)) {
            obj.forEach((tmp_obj, index) => {
              const tmp_path = cur_path + "[" + index + "]";
              if (!tmp_obj || typeof tmp_obj !== "object") return;
              obj_property_traverse(
                tmp_obj,
                tmp_path,
                dec_infos,
                dec_list,
                dec_index_list,
                traverse_all,
              );
            });
            return;
          }
          Object.keys(obj).forEach((key) => {
            const tmp_path = cur_path + "." + key;
            let deal = false;
            for (let i = 0; i < dec_infos["short_keys"].length; i++) {
              if (dec_infos["short_keys"][i] === key) {
                const len = dec_infos["real_keys"][i].length;
                if (
                  tmp_path.slice(tmp_path.length - len) ===
                  dec_infos["real_keys"][i]
                ) {
                  dec_list.push(tmp_path);
                  dec_index_list.push(i);
                  if (!deal && traverse_all && typeof obj[key] === "object") {
                    obj_property_traverse(
                      obj[key],
                      tmp_path,
                      dec_infos,
                      dec_list,
                      dec_index_list,
                      traverse_all,
                    );
                  }
                  deal = true;
                }
              }
            }
            const value = obj[key];
            if (deal || !value || typeof value !== "object") return;
            obj_property_traverse(
              value,
              tmp_path,
              dec_infos,
              dec_list,
              dec_index_list,
              traverse_all,
            );
          });
        }

        function obj_modify(json_obj, path_info) {
          const path = path_info["deal_path"];
          const operator = path_info["operator"];
          let value = path_info["value"];
          const [last_path, last_key] = data_this.get_lastPath_and_key(path);
          const last_obj = data_this.string_to_value(json_obj, last_path);
          if (!last_obj) {
            debugger;
            return log(
              "obj_modify failed, object not found --->" + path_info,
              -1,
            );
          }
          if (operator === "=-") {
            const is_array = typeof last_key === "number";
            if (is_array) last_obj.splice(last_key, 1);
            else delete last_obj[last_key];
            log("Based on: " + path_info.express, "obj_process");
            log("Deleted property -->" + path, "obj_process");
            return;
          }
          if (operator === "=") {
            value = data_this.value_parse(value, path_info, json_obj);
            last_obj[last_key] = value;
            log("Based on: " + path_info.express, "obj_process");
            log("Modified property -->" + path, "obj_process");
          }
          const dec_obj = last_obj[last_key];
          if (!dec_obj) {
            return log(
              "obj_modify failed, object not found --->" + path_info,
              -1,
            );
          }
          if (operator === "=+") {
            value = data_this.value_parse(value, path_info, json_obj);
            if (dec_obj === null || dec_obj === undefined)
              throw new Error("dec_obj is null");
            let type_ = typeof dec_obj;
            if (Array.isArray(dec_obj)) type_ = "array";
            if (type_ === "array") {
              const mode_info = path_info.value_mode;
              if (mode_info) {
                try {
                  mode_info.mode === "arr_insert" &&
                    last_obj[last_key].splice(
                      Number(mode_info.params[0]),
                      0,
                      value,
                    );
                } catch (error) {
                  log(error, -1);
                }
              } else {
                last_obj[last_key].push(value);
              }
            }
            if (type_ === "string" || type_ === "number")
              last_obj[last_key] = last_obj[last_key] + value;
            log("Based on: " + path_info.express, "obj_process");
            log("Modified property -->" + path, "obj_process");
          }
          if (operator === "~=") {
            const search_value = value.split(SPLIT_TAG)[0];
            const replace_value = value.split(SPLIT_TAG)[1];
            last_obj[last_key] = dec_obj.replace(
              new RegExp(search_value, "g"),
              replace_value,
            );
            log("Based on: " + path_info.express, "obj_process");
            log("Modified property -->" + path, "obj_process");
          }
        }
      }

      path_process(json_obj, path) {
        if (path.includes("[-")) {
          const match = path.match(/\[(-\d+)\]/);
          const index = parseInt(match[1]);
          const dec_obj_path = path.slice(0, match.index);
          const array_length = this.string_to_value(
            json_obj,
            dec_obj_path + '["length"]',
          );
          if (!array_length) return path;
          const real_index = array_length + index;
          path = path.replace(`[${index}`, `[${real_index}`);
          return this.path_process(json_obj, path);
        }
        return path;
      }

      value_conditional(value, condition_express) {
        const reg =
          /(\$text|\$value|\$exist|\$notexist)?((>=|<=|>|<|!~=|!=|~=|=))?(.*)/;
        const match = condition_express.match(reg);
        const condition_type = match[1] || "$text";
        const condition_operator = match[2];
        const condition_test_value = match[4];
        const operator_reg = /(>=|<=|>|<|!~=|!=|~=|=)?(.*)$/;
        if (condition_type === "$value") {
          if (![">=", "<=", ">", "<", "="].includes(condition_operator))
            return false;
          const split_tag =
            (condition_test_value.includes(this.value_split_or_tag) &&
              this.value_split_or_tag) ||
            this.value_split_and_tag;
          const condition_test_value_arr =
            condition_test_value.split(split_tag);
          let result;
          for (let test_value of condition_test_value_arr) {
            const operator_match = test_value.match(operator_reg);
            const operator =
              (operator_match && operator_match[1]) || condition_operator;
            test_value = operator_match && operator_match[2];
            if (isNaN(test_value)) {
              if (split_tag === this.value_split_and_tag) return false;
              else continue;
            }
            test_value = parseInt(test_value);
            if (operator === "=") result = test_value === value;
            if (operator === ">=") result = value >= test_value;
            if (operator === "<=") result = value <= test_value;
            if (operator === ">") result = value > test_value;
            if (operator === "<") result = value < test_value;
            if (!result) {
              if (split_tag === this.value_split_and_tag) return false;
              else continue;
            }
            return true;
          }
        }
        if (condition_type === "$exist") {
          return value !== undefined && value !== null;
        }
        if (condition_type === "$notexist") {
          return value === undefined || value === null;
        }
        if (condition_type === "$text") {
          let split_tag;
          let condition_test_value_arr;
          if (["!~=", "~="].includes(condition_operator)) {
            split_tag = this.value_split_and_tag;
            condition_test_value_arr = [condition_test_value];
          } else {
            split_tag =
              (condition_test_value.includes(this.value_split_or_tag) &&
                this.value_split_or_tag) ||
              this.value_split_and_tag;
            condition_test_value_arr = condition_test_value.split(split_tag);
          }
          let result;
          if (typeof value === "object") value = JSON.stringify(value);
          for (let test_value of condition_test_value_arr) {
            const operator_match = test_value.match(operator_reg);
            const operator =
              (operator_match && operator_match[1]) || condition_operator;
            test_value = (operator_match && operator_match[2]) || test_value;
            if (operator === "!=") result = test_value !== value;
            if (operator === "=") result = test_value === value;
            if (operator === "~=") result = new RegExp(test_value).test(value);
            if (operator === "!~=")
              result = !new RegExp(test_value).test(value);
            if (operator === ">=") result = value.length >= test_value.length;
            if (operator === ">") result = value.length > test_value.length;
            if (operator === "<=") result = value.length <= test_value.length;
            if (operator === ">") result = value.length > test_value.length;
            if (!result) {
              if (split_tag === this.value_split_and_tag) return false;
              else continue;
            }
            return true;
          }
        }
        return false;
      }

      obj_conditional(express_info, json_obj) {
        if (!express_info["condition"]) return true;
        const condition_infos = express_info["condition"];
        for (let condition_list of Object.values(condition_infos)) {
          let result = false;
          for (let condition of condition_list) {
            const reg = /^([a-zA-Z_0-9\/\-\.@\[\]]*)?(.*)/;
            const match = condition.match(reg);
            let condition_path = match[1];
            let mod;
            if (condition_path) {
              if (condition_path.startsWith("/")) {
                mod = "child";
              } else if (condition_path.startsWith(".")) {
                mod = "parent";
              } else if (condition_path.startsWith("@")) {
                mod = "global";
              } else {
                mod = "other";
              }
            } else {
              condition_path = express_info.path;
            }
            const conditional_express = match[2];
            if (["child", "parent"].includes(mod)) {
              condition_path = this.get_relative_path(
                express_info.path,
                condition_path,
              );
            }
            if (mod === "other") {
              condition_path = this.get_relative_path(
                "json_obj",
                "/." + condition_path,
              );
            }
            if (mod === "global") {
              condition_path = condition_path.replace(
                "@",
                this.limit_eval ? "unsafeWindow." : "",
              );
            }
            let condition_value;
            try {
              condition_path = this.path_process(json_obj, condition_path);
              condition_value = this.string_to_value(
                mod === "global" ? unsafeWindow : json_obj,
                condition_path,
              );
            } catch (error) {
              continue;
            }
            result = this.value_conditional(
              condition_value,
              conditional_express,
            );
            if (result) {
              express_info.condition_value = condition_value;
              express_info.conform_value_path = condition_path;
              log(
                "Condition satisfied -->",
                condition,
                typeof condition_value === "object"
                  ? "[object Object]"
                  : condition_value,
                "obj_process",
              );
              break;
            }
          }
          if (!result) return false;
        }
        return true;
      }
    }
    return new DATA_PROCESS();
  }

  /* ============ SponsorBlock integration ============ */

  const SB_API = "https://api.sponsor.ajay.app/api/skipSegments";
  const SB_SKIP_CATEGORIES = [
    "sponsor",
    "intro",
    "outro",
    "selfpromo",
    "interaction",
    "music_offtopic",
  ];
  const SB_SKIP_PADDING = 0.35;

  const sb_segmentCache = new Map();
  let sb_currentVideoId = null;
  let sb_currentVideoEl = null;
  let sb_eventListenersAttached = false;

  function sb_log(...args) {
    if (!open_debugger) return;
    log("[SmartSponsorBlock]", ...args, 0);
  }

  function sb_getVideoId() {
    try {
      const url = new URL(location.href);
      const v = url.searchParams.get("v");
      if (v) return v;
      const shorts = location.pathname.match(/\/shorts\/([^/?#]+)/);
      if (shorts) return shorts[1];
      const meta = unsafeWindow.document.querySelector(
        'meta[itemprop="videoId"]',
      );
      if (meta) return meta.content;
    } catch (e) {
      sb_log("getVideoId error", e);
    }
    return null;
  }

  function sb_getVideoElement() {
    return unsafeWindow.document.querySelector("video");
  }

  const SB_CATEGORY_COLORS = {
    sponsor: "#00d400",
    intro: "#00ffff",
    outro: "#0202ed",
    interaction: "#cc00ff",
    music_offtopic: "#ff9900",
    selfpromo: "#ffff00",
    exclusive: "#008a5c",
    filler: "#7300FF",
  };

  function sb_clearProgressBarMarkers() {
    const progressBar =
      unsafeWindow.document.querySelector(".ytp-progress-bar");
    if (!progressBar) return;

    const existing = progressBar.querySelectorAll(".sb-marker");
    existing.forEach((el) => el.remove());

    sb_log("Cleared SponsorBlock markers");
  }

  function sb_renderProgressBarMarkers(segments, videoDuration) {
    if (!segments || segments.length === 0) return;
    if (!videoDuration || videoDuration === 0) return;

    const progressBar =
      unsafeWindow.document.querySelector(".ytp-progress-bar");
    if (!progressBar) return;

    const existing = progressBar.querySelectorAll(".sb-marker");
    existing.forEach((el) => el.remove());

    let markerContainer = progressBar.querySelector(".sb-markers-container");
    if (!markerContainer) {
      markerContainer = unsafeWindow.document.createElement("div");
      markerContainer.className = "sb-markers-container";
      markerContainer.style.position = "relative";
      markerContainer.style.width = "100%";
      markerContainer.style.height = "100%";
      markerContainer.style.pointerEvents = "none";
      progressBar.style.position = "relative";
      progressBar.appendChild(markerContainer);
    }

    if (!unsafeWindow.document.querySelector("#sb-marker-styles")) {
      const style = unsafeWindow.document.createElement("style");
      style.id = "sb-marker-styles";
      style.textContent = `
          .sb-marker {
            position: absolute;
            height: 100%;
            opacity: 0.8;
            pointer-events: auto;
            transition: opacity 0.2s;
          }
          .sb-marker:hover {
            opacity: 1;
          }
        `;
      unsafeWindow.document.head.appendChild(style);
    }

    for (const segment of segments) {
      const color = SB_CATEGORY_COLORS[segment.category] || "#cccccc";
      const startPercent = (segment.start / videoDuration) * 100;
      const endPercent = (segment.end / videoDuration) * 100;
      const widthPercent = endPercent - startPercent;

      const marker = unsafeWindow.document.createElement("div");
      marker.className = "sb-marker";
      marker.style.left = startPercent + "%";
      marker.style.width = widthPercent + "%";
      marker.style.backgroundColor = color;
      marker.title = `${segment.category} (${segment.start.toFixed(0)}s - ${segment.end.toFixed(0)}s)`;

      markerContainer.appendChild(marker);
    }

    sb_log("Rendered", segments.length, "SB progress bar markers");
  }

  function sb_getActiveCategories() {
    const cats = user_data.sb_categories || {};
    return SB_SKIP_CATEGORIES.filter((c) => cats[c] !== "off");
  }

  function sb_fetchSegments(videoId, callback) {
    if (!videoId) {
      callback([]);
      return;
    }

    const activeCategories = sb_getActiveCategories();
    if (activeCategories.length === 0) {
      callback([]);
      return;
    }

    const cacheKey = videoId + "|" + activeCategories.join(",");

    if (sb_segmentCache.has(cacheKey)) {
      callback(sb_segmentCache.get(cacheKey));
      return;
    }

    const url =
      `${SB_API}?videoID=${encodeURIComponent(videoId)}` +
      `&categories=${encodeURIComponent(JSON.stringify(activeCategories))}`;

    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers: { Accept: "application/json" },
      onload: (res) => {
        try {
          const data = JSON.parse(res.responseText);
          const segments = Array.isArray(data)
            ? data
                .map((d) => ({
                  start: d.segment[0],
                  end: d.segment[1],
                  category: d.category,
                }))
                .filter((s) => s.end > s.start)
                .sort((a, b) => a.start - b.start)
            : [];

          const merged = [];
          for (const s of segments) {
            const last = merged[merged.length - 1];
            if (!last || s.start > last.end) {
              merged.push({ ...s });
            } else {
              last.end = Math.max(last.end, s.end);
            }
          }

          sb_segmentCache.set(cacheKey, merged);
          sb_log("Loaded segments for", videoId, merged);
          callback(merged);
        } catch (e) {
          sb_log("Failed to parse SponsorBlock response", e);
          callback([]);
        }
      },
      onerror: () => {
        sb_log("GM_xmlhttpRequest error");
        callback([]);
      },
      ontimeout: () => {
        sb_log("GM_xmlhttpRequest timeout");
        callback([]);
      },
    });
  }

  function sb_attachSkipper(videoId) {
    const video = sb_getVideoElement();
    if (!video || !videoId) return;

    if (
      video === sb_currentVideoEl &&
      videoId === sb_currentVideoId &&
      sb_eventListenersAttached
    ) {
      sb_log("Skipper already attached to", videoId);
      return;
    }

    sb_log("Attaching skipper to video", videoId);
    sb_currentVideoEl = video;
    sb_currentVideoId = videoId;
    sb_eventListenersAttached = false;

    sb_clearProgressBarMarkers();

    sb_fetchSegments(videoId, (segments) => {
      if (!segments.length) {
        sb_log("No sponsor segments for", videoId);
        return;
      }

      let nextIndex = 0;

      if (video.duration && !isNaN(video.duration)) {
        sb_renderProgressBarMarkers(segments, video.duration);
      } else {
        const durationWatcher = () => {
          if (video.duration && !isNaN(video.duration)) {
            sb_renderProgressBarMarkers(segments, video.duration);
            video.removeEventListener("durationchange", durationWatcher);
          }
        };
        observerManager.addListener(video, "durationchange", durationWatcher);
      }

      const skipIfNeeded = () => {
        const t = video.currentTime;
        if (!user_data.default_speed) return;
        while (nextIndex < segments.length) {
          const seg = segments[nextIndex];
          if (t >= seg.start && t < seg.end) {
            video.currentTime = +(seg.end + SB_SKIP_PADDING).toFixed(2);
            sb_log(`Skipped sponsor: ${seg.start} → ${seg.end}`);
            nextIndex++;
          } else if (t < seg.start) {
            break;
          } else {
            nextIndex++;
          }
        }
      };

      const onSeeking = () => {
        nextIndex = segments.findIndex((s) => video.currentTime < s.end);
        if (nextIndex === -1) nextIndex = segments.length;

        const inside = segments.find(
          (s) => video.currentTime >= s.start && video.currentTime < s.end,
        );

        if (inside) {
          video.currentTime = +(inside.end + SB_SKIP_PADDING).toFixed(2);
          sb_log("Seeked into sponsor, skipped");
          nextIndex = segments.indexOf(inside) + 1;
        }
      };

      observerManager.addListener(video, "timeupdate", skipIfNeeded);
      observerManager.addListener(video, "seeking", onSeeking);
      sb_eventListenersAttached = true;

      const watcher = unsafeWindow.setInterval(() => {
        if (
          !unsafeWindow.document.contains(video) ||
          sb_getVideoElement() !== video
        ) {
          video.removeEventListener("timeupdate", skipIfNeeded);
          video.removeEventListener("seeking", onSeeking);
          unsafeWindow.clearInterval(watcher);
          sb_currentVideoEl = null;
          sb_currentVideoId = null;
          sb_eventListenersAttached = false;
          sb_log("Detached skipper from old video element");
        }
      }, 1500);
    });
  }

  function init_sponsorblock() {
    if (user_data.sponsorblock === "off") {
      return;
    }

    if (unsafeWindow.__yt_sb_initialized) {
      return;
    }
    unsafeWindow.__yt_sb_initialized = true;

    function handleNavigation() {
      if (user_data.sponsorblock === "off") return;

      if (
        ![
          "yt_watch",
          "mobile_yt_watch",
          "yt_shorts",
          "mobile_yt_shorts",
          "yt_music_watch",
        ].includes(page_type)
      ) {
        return;
      }

      const videoId = sb_getVideoId();
      if (!videoId) {
        sb_log("No videoId found for current page_type", page_type);
        return;
      }

      unsafeWindow.setTimeout(() => {
        sb_attachSkipper(videoId);
      }, 800);
    }

    unsafeWindow.document.addEventListener(
      "yt-navigate-finish",
      handleNavigation,
    );
    unsafeWindow.document.addEventListener(
      "yt-page-data-updated",
      handleNavigation,
    );

    handleNavigation();

    sb_log("SponsorBlock navigation listeners attached");
  }

  function init_duplicate_song_prevention() {
    if (user_data.duplicate_song_prevention !== "on") {
      return;
    }
    if (!["yt_music_home", "yt_music_watch"].includes(page_type)) {
      return;
    }

    // Guard: check if already initialized to avoid duplicate listeners/observers
    if (unsafeWindow.__yt_dsp_initialized) {
      sb_log("Duplicate song prevention already initialized, skipping");
      return;
    }
    unsafeWindow.__yt_dsp_initialized = true;

    let lastPlayedSong = null;
    let lastPlayedArtist = null;
    const playHistory = [];
    const maxHistoryLength = 50;

    let pendingCheck = null;
    let lastProcessedTitle = null;

    function getSongInfo() {
      const titleElement = document.querySelector(
        "yt-formatted-string.style-scope.ytmusic-player-bar",
      );
      const artistElement = document.querySelector(
        "span.subtitle.style-scope.ytmusic-player-bar a",
      );

      const title = titleElement?.textContent?.trim() || null;
      const artist = artistElement?.textContent?.trim() || null;

      return { title, artist };
    }

    function shouldSkipSong(title, artist) {
      if (!title) return false;

      if (title === lastPlayedSong) {
        sb_log(`Duplicate song detected: ${title}`);
        return true;
      }

      if (artist && artist === lastPlayedArtist) {
        sb_log(`Duplicate artist detected (consecutive): ${artist}`);
        return true;
      }

      return false;
    }

    function updateHistory(title, artist) {
      playHistory.push({ title, artist });
      if (playHistory.length > maxHistoryLength) {
        playHistory.shift();
      }
      lastPlayedSong = title;
      lastPlayedArtist = artist;
      lastProcessedTitle = title;
    }

    function handleSongChange() {
      if (pendingCheck) {
        clearTimeout(pendingCheck);
      }

      pendingCheck = setTimeout(() => {
        const { title, artist } = getSongInfo();

        if (!title || title === lastProcessedTitle) {
          pendingCheck = null;
          return;
        }

        if (shouldSkipSong(title, artist)) {
          const nextBtn =
            document.querySelector("button[aria-label='Next']") ||
            document.querySelector("button.yt-spec-button-shape-next");

          if (nextBtn) {
            nextBtn.click();
            sb_log(`Skipped duplicate: ${title}`);
          }
        } else {
          updateHistory(title, artist);
        }

        pendingCheck = null;
      }, 500);
    }

    const navFinishListener = handleSongChange;
    const pageDataListener = handleSongChange;

    unsafeWindow.document.addEventListener(
      "yt-navigate-finish",
      navFinishListener,
    );
    unsafeWindow.document.addEventListener(
      "yt-page-data-updated",
      pageDataListener,
    );

    const observer = new MutationObserver(handleSongChange);

    const playerElement = document.querySelector("ytmusic-player-bar");
    if (playerElement) {
      observer.observe(playerElement, {
        subtree: true,
        characterData: true,
      });
    }

    unsafeWindow.__yt_dsp_cleanup = () => {
      unsafeWindow.document.removeEventListener(
        "yt-navigate-finish",
        navFinishListener,
      );
      unsafeWindow.document.removeEventListener(
        "yt-page-data-updated",
        pageDataListener,
      );
      observer.disconnect();
      if (pendingCheck) {
        clearTimeout(pendingCheck);
      }
      unsafeWindow.__yt_dsp_initialized = false;
      sb_log("Duplicate song prevention cleaned up");
    };

    sb_log("Duplicate song prevention initialized");
  }

  /* ====== CLEANUP DUPLICATE SONG PREVENTION ====== */

  function cleanup_duplicate_song_prevention() {
    if (typeof unsafeWindow.__yt_dsp_cleanup === "function") {
      unsafeWindow.__yt_dsp_cleanup();
    }
  }

  /* ====== HIDE CREATE BUTTON ====== */

  function init_create_button_observer() {
    const header =
      unsafeWindow.document.querySelector("ytd-masthead") ||
      unsafeWindow.document.querySelector(
        "ytm-app > ytm-mobile-topbar-renderer",
      );
    if (!header) return;

    const observer = new MutationObserver(() => {
      hide_create_button();
    });

    observer.observe(header, {
      childList: true,
      subtree: true,
    });

    hide_create_button();

    unsafeWindow.__yt_create_button_observer = observer;
  }

  /* ====== GLOBAL SHORTS BLOCKER ====== */

  function init_global_shorts_blocker() {
    const processedElements = new WeakSet();

    function hideElement(element) {
      if (!element || processedElements.has(element)) return;
      element.style.display = "none";
      processedElements.add(element);
    }

    function blockShorts() {
      if (user_data.global_shorts_block !== "on") {
        hide_shorts_sections_if_disabled();
        return;
      }

      // Hide reel shelf renderers (Shorts shelves on home/subscriptions)
      document.querySelectorAll("ytd-reel-shelf-renderer").forEach((element) => {
        hideElement(element);
      });

      // Hide Shorts sidebar entry in the guide menu
      document.querySelectorAll('ytd-guide-entry-renderer').forEach((entry) => {
        const link = entry.querySelector('a[title="Shorts"]');
        if (link) {
          hideElement(entry);
        }
      });

      // Hide Shorts in compact sidebar (mini guide)
      document.querySelectorAll('ytd-mini-guide-entry-renderer').forEach((entry) => {
        const link = entry.querySelector('a[title="Shorts"]');
        if (link) {
          hideElement(entry);
        }
      });

      // Hide Shorts chips in filter bar
      document.querySelectorAll("yt-chip-cloud-chip-renderer").forEach((element) => {
        const chipText = element.querySelector(".ytChipShapeChip");
        if (chipText?.textContent.trim() === "Shorts") {
          hideElement(element);
        }
      });

      // Hide individual Shorts items in search/home/subscriptions
      document.querySelectorAll('a[href^="/shorts/"]:not([data-shorts-processed])').forEach((link) => {
        link.setAttribute("data-shorts-processed", "true");

        // Hide video renderer (for search results)
        const videoRenderer = link.closest("ytd-video-renderer");
        if (videoRenderer) {
          hideElement(videoRenderer);
        }

        // Hide grid video renderer (for grid view)
        const gridRenderer = link.closest("ytd-grid-video-renderer");
        if (gridRenderer) {
          hideElement(gridRenderer);
        }

        // Hide rich item renderer (for home/subscriptions)
        const richItem = link.closest("ytd-rich-item-renderer");
        if (richItem) {
          hideElement(richItem);
        }

        // Hide compact video renderer
        const compactRenderer = link.closest("ytd-compact-video-renderer");
        if (compactRenderer) {
          hideElement(compactRenderer);
        }
      });

      // Hide mobile Shorts lockup view models
      document.querySelectorAll("ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model").forEach((element) => {
        hideElement(element);
      });

      // Hide grid shelf items containing Shorts
      document.querySelectorAll(".ytGridShelfViewModelGridShelfItem:not([data-shorts-processed])").forEach((item) => {
        if (item.querySelector('ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model, a[href^="/shorts/"]')) {
          hideElement(item);
        }
        item.setAttribute("data-shorts-processed", "true");
      });

      // Hide grid-shelf-view-model containing Shorts
      document.querySelectorAll("grid-shelf-view-model:not([data-shorts-processed])").forEach((shelf) => {
        shelf.setAttribute("data-shorts-processed", "true");
        const hasShorts =
          shelf.querySelector("ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model") ||
          shelf.querySelector('.shelf-header-layout-wiz__title span[role="text"]')?.textContent?.includes("Shorts");
        if (hasShorts) {
          hideElement(shelf);
        }
      });

      // Hide Shorts tab on channel pages and subscriptions using tab-title attribute
      document.querySelectorAll('yt-tab-shape[tab-title="Shorts"]').forEach((tab) => {
        hideElement(tab);
      });

      // Fallback for Shorts tabs without tab-title attribute
      document.querySelectorAll('yt-tab-shape:not([data-shorts-processed])').forEach((tab) => {
        tab.setAttribute("data-shorts-processed", "true");
        const tabText = tab.querySelector('.yt-tab-shape__tab');
        if (tabText?.textContent?.trim() === "Shorts") {
          hideElement(tab);
        }
      });

      // Hide Shorts sections with "Shorts" title in rich sections
      document.querySelectorAll("ytd-rich-section-renderer:not([data-shorts-processed])").forEach((section) => {
        section.setAttribute("data-shorts-processed", "true");
        const titleSpan = section.querySelector(
          ".yt-shelf-header-layout__title .yt-core-attributed-string, .yt-shelf-header-layout__title-row .yt-core-attributed-string"
        );
        const text = titleSpan?.textContent?.trim();
        if (text === "Shorts") {
          hideElement(section);
        }
      });

      // Hide ytd-rich-shelf-renderer with Shorts content
      document.querySelectorAll("ytd-rich-shelf-renderer:not([data-shorts-processed])").forEach((shelf) => {
        shelf.setAttribute("data-shorts-processed", "true");
        const title = shelf.querySelector("#title-container h2, .ytd-rich-shelf-renderer #title");
        if (title?.textContent?.trim() === "Shorts") {
          hideElement(shelf);
        }
      });

      hide_shorts_sections_if_disabled();
    }

    const observer = new MutationObserver(function (mutations) {
      let shouldProcess = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldProcess = true;
          break;
        }
      }
      if (shouldProcess) {
        blockShorts();
      }
    });

    blockShorts();

    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    unsafeWindow.__yt_global_shorts_blocker = {
      reRun: blockShorts,
    };
  }


  /* ====== HOME FEED GRID ROW CONTROLLER ====== */

  const gridDynamicStyle = (() => {
    const el = unsafeWindow.document.createElement("style");
    el.id = "vbt-grid-dynamic-style";
    unsafeWindow.document.head.appendChild(el);
    return el;
  })();

  // Inject static grid CSS (layout fixes from original Grid Row Controller)
  (() => {
    const el = unsafeWindow.document.createElement("style");
    el.id = "vbt-grid-static-style";
    el.textContent = `
      ytd-rich-item-renderer[rendered-from-rich-grid][is-in-first-column] {
        margin-left: calc(var(--ytd-rich-grid-item-margin) / 2) !important;
      }
      ytd-rich-item-renderer[hidden][is-responsive-grid],
      [is-slim-media] { display: block !important; }
      ytd-rich-item-renderer { margin-bottom: var(--ytd-rich-grid-row-margin) !important; }
      .button-container.ytd-rich-shelf-renderer { display: none !important; }
      #dismissible.ytd-rich-shelf-renderer {
        padding-bottom: 0 !important;
        border-bottom: none !important;
      }
      #selected-chip-content { width: 0% !important; }
      #spacer.ytd-shelf-renderer { flex: 9 !important; }
      ytd-feed-filter-chip-bar-renderer[frosted-glass-mode=with-chipbar]
        #chips-wrapper.ytd-feed-filter-chip-bar-renderer { flex-direction: row; }
      #chips-content { width: 92% !important; }
      .itemPerRowControl {
        display: flex; justify-content: right; align-items: center;
        z-index: 2025; flex: 1; gap: 10px; box-sizing: border-box;
        user-select: none; width: 8%;
      }
      .itemPerRowControl button {
        border: none; color: var(--yt-spec-text-primary);
        background-color: transparent; font-size: 24px;
        text-align: center; display: inline-block;
        height: 30px; aspect-ratio: 1/1; border-radius: 50%;
      }
      .itemPerRowControl button:hover {
        background-color: var(--yt-spec-button-chip-background-hover);
        cursor: pointer;
      }
    `;
    unsafeWindow.document.head.appendChild(el);
  })();

  function gridUpdatePageLayout() {
    // Only show one row's worth of loading placeholders (ghost cards) - see ghostFix below
    const ghostRowLimit = (parseInt(user_data.grid_content_per_row, 10) || 3) + 1;
    const ghostRule = `
      ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) .ghost-card:nth-child(n+${ghostRowLimit}) {
        display: none;
      }`;
    gridDynamicStyle.textContent = `
      ytd-rich-grid-renderer {
        --ytd-rich-grid-items-per-row: ${user_data.grid_content_per_row} !important;
      }
      ytd-rich-shelf-renderer:not([is-shorts]) {
        --ytd-rich-grid-items-per-row: ${user_data.grid_news_per_row} !important;
      }
      ytd-rich-shelf-renderer[is-shorts] {
        --ytd-rich-grid-slim-items-per-row: ${user_data.grid_shorts_per_row} !important;
        --ytd-rich-grid-items-per-row: ${user_data.grid_shorts_per_row} !important;
      }
      ${ghostRule}
    `;
  }

  function gridIsCreatorPage() {
    return unsafeWindow.location.pathname.startsWith("/@");
  }

  function gridCreateControlDiv(type) {
    const controlDiv = unsafeWindow.document.createElement("div");
    controlDiv.classList.add("style-scope", "ytd-rich-grid-renderer", "itemPerRowControl");

    ["-", "+"].forEach((symbol) => {
      const btn = unsafeWindow.document.createElement("button");
      btn.textContent = symbol;
      btn.addEventListener("click", () => {
        if (symbol === "+") user_data["grid_" + type + "_per_row"]++;
        else if (user_data["grid_" + type + "_per_row"] > 1) user_data["grid_" + type + "_per_row"]--;
        gridUpdatePageLayout();
        user_data_api.set();
      });
      controlDiv.appendChild(btn);
    });

    return controlDiv;
  }

  function gridTryAttachControl(anchor, t) {
    if (!anchor) return;
    if (gridIsCreatorPage()) return;
    if (anchor.parentNode?.querySelector?.(".itemPerRowControl")) return;

    const type = typeof t.type === "function" ? t.type(anchor) : t.type;
    const control = gridCreateControlDiv(type);

    if (t.selector === "#chips-wrapper") {
      control.classList.add("justify-left-custom");
    } else if (t.selector.startsWith("ytd-shelf-renderer")) {
      control.classList.add("justify-center-custom");
    }

    t.place(anchor, control);
  }

  function gridInitWatcher() {
    const targets = [
      {
        selector: "#chips-wrapper",
        type: "content",
        place: (anchor, control) => anchor.appendChild(control),
      },
      {
        selector: "ytd-rich-section-renderer #menu-container",
        type: (node) =>
          node.closest("ytd-rich-section-renderer")?.querySelector("[is-shorts]")
            ? "shorts"
            : "news",
        place: (anchor, control) => anchor.parentNode.insertBefore(control, anchor),
      },
      {
        selector: "ytd-shelf-renderer #title-container.style-scope.ytd-shelf-renderer",
        type: "content",
        place: (anchor, control) => anchor.appendChild(control),
      },
    ];

    // Scan elements already in DOM
    for (const t of targets) {
      unsafeWindow.document.querySelectorAll(t.selector).forEach((anchor) => {
        gridTryAttachControl(anchor, t);
      });
    }

    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          for (const t of targets) {
            const anchor = node.matches(t.selector) ? node : node.querySelector?.(t.selector);
            if (anchor) gridTryAttachControl(anchor, t);
          }
        }
      }
    });

    observer.observe(unsafeWindow.document.documentElement, { subtree: true, childList: true });
  }

  // Kick off grid layout immediately
  gridUpdatePageLayout();
  gridInitWatcher();

  /* ====== GRID LOADING PLACEHOLDER (GHOST CARD) FIX ======
   * Ported and adapted from Control Panel for YouTube by insin
   * https://github.com/insin/control-panel-for-youtube (page.js: fixGhostCards)
   *
   * Fixes YouTube's grid loading placeholders on Home and Subscriptions (desktop):
   *  - placeholders are moved out of the continuation renderer and into the grid,
   *    so they flow like real thumbnails and match their size
   *  - only one row's worth of placeholders is shown (see gridUpdatePageLayout)
   *  - the loading spinner is cloned below the grid instead of beside the placeholders
   */
  const ghostFix = (() => {
    const PAGES = ["home", "subscriptions"];
    const STYLE_ID = "vbt-ghost-fix-style";
    const CSS = `
      ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) {
        /* Make continuation item renderer retain position but take up no space */
        ytd-continuation-item-renderer {
          height: 1px;
          margin-left: -1px;
          max-width: 1px;
          opacity: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .vbt-ghost-cards {
          display: contents;
        }
        .ghost-card {
          --ytd-rich-item-row-usable-width: calc(100% - var(--ytd-rich-grid-gutter-margin, 16px) * 2);
          margin-bottom: var(--ytd-rich-grid-row-margin);
          width: calc(var(--ytd-rich-item-row-usable-width)/var(--ytd-rich-grid-items-per-row) - var(--ytd-rich-grid-item-margin, 16px) - .01px);
        }
      }
      /* Container for cloned loading spinner */
      .vbt-grid-spinner {
        align-items: center;
        display: flex;
        justify-content: center;
        width: 100%;
      }
      /* Revert CSS from the "Youtube-shorts block" extension which breaks loading */
      ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) {
        ytd-continuation-item-renderer:not(:last-child):not(#comments *):not([style*="display: none"]) {
          display: flex !important;
        }
      }
    `;

    const grids = new Set(); // per-grid state, for teardown
    const attachedContents = new Set(); // grid #contents elements already observed
    let navToken = 0;
    let scanTimer = null;

    // Always on: this is a fix, not a user preference.
    const isEnabled = () => true;
    const perRow = () => Math.max(1, parseInt(user_data.grid_content_per_row, 10) || 3);
    const isGridPage = () => {
      const p = unsafeWindow.location.pathname;
      return p === "/" || p.startsWith("/feed/subscriptions");
    };

    function setStyle(on) {
      let el = unsafeWindow.document.getElementById(STYLE_ID);
      if (on && !el) {
        el = unsafeWindow.document.createElement("style");
        el.id = STYLE_ID;
        el.textContent = CSS;
        unsafeWindow.document.documentElement.appendChild(el);
      } else if (!on && el) {
        el.remove();
      }
    }

    function attachGrid($renderer) {
      const $contents = $renderer.querySelector(":scope > #contents");
      if (!$contents) return false;
      if (attachedContents.has($contents)) return true;
      attachedContents.add($contents);

      const ghostClones = new WeakMap();
      const spinnerClones = new WeakMap();
      const spinnerObservers = new WeakMap();
      const seen = new WeakSet();
      let $lastGhost = null;
      let $lastSpinner = null;

      function onAdded($cr) {
        if (seen.has($cr)) return;
        seen.add($cr);
        if ($lastGhost?.isConnected) $lastGhost.remove();
        if ($lastSpinner?.isConnected) $lastSpinner.remove();

        $lastGhost = unsafeWindow.document.createElement("div");
        $lastGhost.className = "vbt-ghost-cards";
        const $cards = $cr.querySelectorAll(".ghost-grid .ghost-card");
        if ($cards.length > 0) {
          $lastGhost.append(...$cards);
          // Add more cards if YouTube didn't generate enough for a full row
          for (let i = $lastGhost.childElementCount; i < perRow(); i++) {
            $lastGhost.append($lastGhost.lastElementChild.cloneNode(true));
          }
          // YouTube can remove the continuation renderer before we move ghost cards
          if ($cr.isConnected) {
            $cr.insertAdjacentElement("afterend", $lastGhost);
            ghostClones.set($cr, $lastGhost);
          }
        }

        const $spinner = $cr.querySelector("tp-yt-paper-spinner");
        if ($spinner) {
          const check = () => {
            if (!$spinner.hasAttribute("active")) return;
            mo.disconnect();
            if (!$cr.isConnected) return;
            $lastSpinner = unsafeWindow.document.createElement("div");
            $lastSpinner.className = "vbt-grid-spinner";
            $lastSpinner.append($spinner.cloneNode(true));
            $contents.append($lastSpinner);
            spinnerClones.set($cr, $lastSpinner);
          };
          const mo = new MutationObserver(check);
          mo.observe($spinner, { attributes: true, attributeFilter: ["active"] });
          spinnerObservers.set($cr, mo);
          check();
        }
      }

      function onRemoved($cr) {
        seen.delete($cr);
        const g = ghostClones.get($cr);
        if (g) {
          ghostClones.delete($cr);
          if (g.isConnected) g.remove();
          if (g === $lastGhost) $lastGhost = null;
        }
        const sp = spinnerClones.get($cr);
        if (sp) {
          spinnerClones.delete($cr);
          if (sp.isConnected) sp.remove();
          if (sp === $lastSpinner) $lastSpinner = null;
        }
        const mo = spinnerObservers.get($cr);
        if (mo) {
          mo.disconnect();
          spinnerObservers.delete($cr);
        }
      }

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const n of m.removedNodes) {
            if (n.nodeName === "YTD-CONTINUATION-ITEM-RENDERER") onRemoved(n);
          }
          for (const n of m.addedNodes) {
            if (n.nodeName === "YTD-CONTINUATION-ITEM-RENDERER") onAdded(n);
          }
        }
      });
      observer.observe($contents, { childList: true });

      // A continuation renderer may already be present by the time we attach
      $contents
        .querySelectorAll(":scope > ytd-continuation-item-renderer")
        .forEach(onAdded);

      grids.add({
        $contents,
        destroy() {
          observer.disconnect();
          if ($lastGhost?.isConnected) $lastGhost.remove();
          if ($lastSpinner?.isConnected) $lastSpinner.remove();
          $contents
            .querySelectorAll(":scope > ytd-continuation-item-renderer")
            .forEach((cr) => spinnerObservers.get(cr)?.disconnect());
        },
      });
      return true;
    }

    function scan() {
      clearTimeout(scanTimer);
      const token = ++navToken;
      if (!isEnabled() || !isGridPage()) return;
      let tries = 0;
      const attempt = () => {
        if (token !== navToken || !isEnabled()) return;
        let found = false;
        for (const page of PAGES) {
          const $r = $(`ytd-browse[page-subtype="${page}"] ytd-rich-grid-renderer`);
          if ($r && attachGrid($r)) found = true;
        }
        // The grid renders after navigation - retry for up to ~10s
        if (!found && ++tries < 40) scanTimer = setTimeout(attempt, 250);
      };
      attempt();
    }

    function teardown() {
      clearTimeout(scanTimer);
      navToken++;
      for (const g of grids) g.destroy();
      grids.clear();
      attachedContents.clear();
      unsafeWindow.document
        .querySelectorAll(".vbt-ghost-cards, .vbt-grid-spinner")
        .forEach((el) => el.remove());
    }

    // Call after the setting (or per-row count) changes
    function sync() {
      gridUpdatePageLayout();
      if (isEnabled()) {
        setStyle(true);
        scan();
      } else {
        teardown();
        setStyle(false);
      }
    }

    function init() {
      unsafeWindow.addEventListener("yt-navigate-finish", scan, { passive: true });
      unsafeWindow.addEventListener("yt-page-data-updated", scan, { passive: true });
      if (isEnabled()) setStyle(true);
      scan();
    }

    return { init, sync };
  })();

  ghostFix.init();

  /* ====== UNIFIED SETTINGS PAGE (General / Watch Page / Player) ====== */

  /* ====== DIAGNOSTICS / BACKUP HELPERS (Settings -> Advanced) ====== */

  function vbt_mask_channel_id() {
    const s = "" + channel_id;
    return s === "default" || s.length <= 10 ? s : s.slice(0, 5) + "..." + s.slice(-5);
  }

  function vbt_status_text() {
    if (!isinint) return "Initialization failed";
    return error_messages.length === 0
      ? "Running normally"
      : "Running with " + error_messages.length + " error(s)";
  }

  function vbt_diagnostics_text() {
    let tips = `script ${flag_info.init} ${isinint ? flag_info.success : flag_info.failed}`;
    if (error_messages.length === 0 && isinint) tips += " " + flag_info.runing_normally;
    for (let key of Object.keys(inject_info)) {
      if (!mobile_web && key === "ytInitialPlayerResponse") continue;
      if (
        key === "ytInitialReelWatchSequenceResponse" &&
        !["yt_shorts", "mobile_yt_shorts"].includes(page_type)
      )
        continue;
      tips += `\n${key} ${flag_info.inject} ${inject_info[key] ? flag_info.success : flag_info.failed}`;
    }
    const tmp_user_data = JSON.parse(JSON.stringify(user_data));
    delete tmp_user_data.shorts_list;
    delete tmp_user_data.channel_infos;
    tips += `\n\n${flag_info.config_info}\n${JSON.stringify(tmp_user_data, null, 2)}\n\n${flag_info.page_info}\npage_type: ${page_type}\nhref: ${href}`;
    tips += `\n\nbrowser_info\n${JSON.stringify(browser_info, null, 2)}`;
    tips += `\n\naccount_info\nchannel_id: ${vbt_mask_channel_id()}`;
    if (error_messages.length !== 0) {
      tips += `\n\n${flag_info.exists_error}\n-----------${flag_info.err_msg}(${flag_info.ctoc})-----------------\n${error_messages.join("\n")}\n\n${flag_info.tips}`;
    }
    return tips;
  }

  function vbt_copy_text(text) {
    try {
      GM_setClipboard(text, "text");
      return true;
    } catch (e) {
      try {
        unsafeWindow.navigator.clipboard.writeText(text);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function vbt_export_settings() {
    try {
      const exportData = JSON.parse(JSON.stringify(user_data));
      delete exportData.shorts_list;
      delete exportData.channel_infos;
      delete exportData.login;
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = unsafeWindow.document.createElement("a");
      a.href = url;
      a.download = "vBlockTube-settings.vbt";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + e.message);
    }
  }

  function vbt_import_settings() {
    const fileInput = unsafeWindow.document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".vbt";
    fileInput.style.display = "none";
    unsafeWindow.document.body.appendChild(fileInput);
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (typeof imported !== "object" || imported === null) {
            throw new Error("Invalid settings file.");
          }
          const preserved = {
            shorts_list: user_data.shorts_list,
            channel_infos: user_data.channel_infos,
            login: user_data.login,
            language: user_data.language,
          };
          Object.assign(user_data, imported, preserved);
          user_data_api.set();
          alert("Settings imported successfully. The page will now reload.");
          unsafeWindow.location.reload();
        } catch (err) {
          alert("Import failed: " + err.message);
        } finally {
          fileInput.remove();
        }
      };
      reader.readAsText(file);
    });
    fileInput.click();
  }

  const VBT_SETTINGS_ID = "vbt-settings";

  // True when YouTube itself is currently rendered dark (checks the real
  // background colour, so it also works with forced / extension dark themes).
  function vbt_page_is_dark() {
    const d = unsafeWindow.document;
    if (d.documentElement.hasAttribute("dark")) return true;
    const parse = (c) => {
      const m = c && c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map(parseFloat);
      if (p.length === 4 && p[3] === 0) return null;
      return p;
    };
    const candidates = [
      d.querySelector("ytd-masthead #container"),
      d.querySelector("ytd-masthead"),
      d.body,
      d.documentElement,
    ];
    for (const el of candidates) {
      if (!el) continue;
      const p = parse(unsafeWindow.getComputedStyle(el).backgroundColor);
      if (p) return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] < 128;
    }
    return false;
  }

  // Panel follows the script's Dark mode setting (On / Off / Auto).
  function vbt_settings_theme() {
    const m = user_data.dark_mode;
    if (m === "on") return "dark";
    if (m === "off") return "light";
    return vbt_page_is_dark() || darkModeSystem.getSystemPreference()
      ? "dark"
      : "light";
  }

  function display_settings_win(initialTab) {
    const doc = unsafeWindow.document;
    doc.getElementById(VBT_SETTINGS_ID)?.remove();
    doc.getElementById(VBT_SETTINGS_ID + "-style")?.remove();

    const css = `
#vbt-settings{--vbt-bg:#ffffff;--vbt-fg:#0f0f0f;--vbt-muted:#606060;--vbt-line:rgba(0,0,0,.12);--vbt-chip:rgba(0,0,0,.06);--vbt-chip-active:rgba(0,0,0,.12);--vbt-accent:#065fd4;--vbt-accent-fg:#ffffff;--vbt-field:#ffffff;color-scheme:light;}
#vbt-settings[data-theme="dark"]{--vbt-bg:#212121;--vbt-fg:#f1f1f1;--vbt-muted:#aaaaaa;--vbt-line:rgba(255,255,255,.16);--vbt-chip:rgba(255,255,255,.08);--vbt-chip-active:rgba(255,255,255,.16);--vbt-accent:#3ea6ff;--vbt-accent-fg:#0f0f0f;--vbt-field:#2d2d2d;color-scheme:dark;}
#vbt-settings{position:fixed;inset:0;z-index:999999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:"Roboto","Segoe UI",system-ui,-apple-system,sans-serif;}
#vbt-settings *{box-sizing:border-box;}
#vbt-settings .vbt-s-dialog{display:flex;flex-direction:column;width:min(780px,94vw);height:min(640px,88vh);background:var(--vbt-bg);color:var(--vbt-fg);border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.4);overflow:hidden;}
#vbt-settings .vbt-s-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 14px 22px;border-bottom:1px solid var(--vbt-line);}
#vbt-settings .vbt-s-head h2{margin:0;font-size:18px;font-weight:600;}
#vbt-settings .vbt-s-head small{margin-left:8px;font-size:12px;font-weight:400;color:var(--vbt-muted);}
#vbt-settings .vbt-s-close{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;}
#vbt-settings .vbt-s-close:hover{background:var(--vbt-chip);}
#vbt-settings .vbt-s-main{display:flex;flex:1;min-height:0;}
#vbt-settings .vbt-s-nav{width:190px;flex:none;padding:12px 10px;border-right:1px solid var(--vbt-line);display:flex;flex-direction:column;gap:4px;}
#vbt-settings .vbt-s-tab{display:flex;align-items:center;gap:10px;padding:10px 12px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer;}
#vbt-settings .vbt-s-tab:hover{background:var(--vbt-chip);}
#vbt-settings .vbt-s-tab.active{background:var(--vbt-chip-active);font-weight:600;}
#vbt-settings .vbt-s-tab svg{width:20px;height:20px;fill:currentColor;flex:none;}
#vbt-settings .vbt-s-content{flex:1;overflow-y:auto;padding:0 26px 24px;}
#vbt-settings .vbt-s-page{display:none;}
#vbt-settings .vbt-s-page.active{display:block;}
#vbt-settings .vbt-s-section{margin-top:22px;}
#vbt-settings .vbt-s-section h3{margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--vbt-muted);}
#vbt-settings .vbt-s-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px;padding:10px 0;border-bottom:1px solid var(--vbt-line);}
#vbt-settings .vbt-s-row:last-child{border-bottom:0;}
#vbt-settings label.vbt-s-row{cursor:pointer;}
#vbt-settings .vbt-s-title{font-size:14px;line-height:1.3;}
#vbt-settings .vbt-s-desc{margin-top:2px;font-size:12px;line-height:1.35;color:var(--vbt-muted);}
#vbt-settings .vbt-s-switch{position:relative;width:40px;height:22px;flex:none;}
#vbt-settings .vbt-s-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:1;}
#vbt-settings .vbt-s-switch i{position:absolute;inset:0;border-radius:11px;background:rgba(128,128,128,.45);transition:background .18s;pointer-events:none;}
#vbt-settings .vbt-s-switch i::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .18s;}
#vbt-settings .vbt-s-switch input:checked + i{background:var(--vbt-accent);}
#vbt-settings .vbt-s-switch input:checked + i::after{transform:translateX(18px);}
#vbt-settings .vbt-s-switch input:focus-visible + i{outline:2px solid var(--vbt-accent);outline-offset:2px;}
#vbt-settings .vbt-s-row.disabled{opacity:.45;pointer-events:none;}
#vbt-settings .vbt-s-seg{display:inline-flex;flex:none;border:1px solid var(--vbt-line);border-radius:10px;overflow:hidden;}
#vbt-settings .vbt-s-seg button{border:0;background:transparent;color:inherit;font:inherit;font-size:13px;padding:6px 12px;cursor:pointer;}
#vbt-settings .vbt-s-seg button + button{border-left:1px solid var(--vbt-line);}
#vbt-settings .vbt-s-seg button.on{background:var(--vbt-accent);color:var(--vbt-accent-fg);}
#vbt-settings .vbt-s-seg button:disabled{opacity:.4;cursor:not-allowed;}
#vbt-settings .vbt-s-select{flex:none;min-width:130px;padding:7px 10px;border-radius:8px;border:1px solid var(--vbt-line);background:var(--vbt-field);color:inherit;font:inherit;font-size:13px;}
#vbt-settings .vbt-s-btn{flex:none;padding:8px 16px;border:0;border-radius:18px;background:#cc0000;color:#fff;font:inherit;font-size:13px;font-weight:500;cursor:pointer;}
#vbt-settings .vbt-s-btn:hover{background:#a80000;}
#vbt-settings .vbt-s-sub{margin:2px 0 4px 18px;padding-left:14px;border-left:2px solid var(--vbt-line);}
#vbt-settings .vbt-s-dot{display:inline-block;width:10px;height:10px;margin-right:8px;border-radius:50%;}
#vbt-settings .vbt-s-spacer{flex:1;min-height:8px;}
#vbt-settings .vbt-s-val{flex:none;max-width:60%;font-size:13px;color:var(--vbt-muted);text-align:right;word-break:break-word;}
#vbt-settings .vbt-s-val.ok{color:#2ba640;}
#vbt-settings .vbt-s-val.bad{color:#d93025;}
#vbt-settings .vbt-s-actions{display:flex;flex:none;gap:8px;}
#vbt-settings .vbt-s-btn.alt{background:var(--vbt-chip-active);color:var(--vbt-fg);}
#vbt-settings .vbt-s-btn.alt:hover{background:var(--vbt-line);}
#vbt-settings .vbt-s-pre{display:none;margin:8px 0 0;padding:12px;max-height:320px;overflow:auto;border-radius:10px;background:var(--vbt-chip);color:var(--vbt-fg);font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word;user-select:text;}
#vbt-settings .vbt-s-pre.open{display:block;}
#vbt-settings .vbt-s-foot{padding:10px 22px;border-top:1px solid var(--vbt-line);font-size:11px;color:var(--vbt-muted);}
#vbt-settings .vbt-s-foot a{color:inherit;}
@keyframes vbt-fade-in{from{opacity:0}to{opacity:1}}
@keyframes vbt-fade-out{from{opacity:1}to{opacity:0}}
@keyframes vbt-pop-in{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@keyframes vbt-pop-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(8px) scale(.98)}}
@keyframes vbt-page-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
#vbt-settings{animation:vbt-fade-in .2s ease-out both;}
#vbt-settings .vbt-s-dialog{animation:vbt-pop-in .26s cubic-bezier(.2,.8,.2,1) both;}
#vbt-settings.vbt-closing{animation:vbt-fade-out .17s ease-in both;pointer-events:none;}
#vbt-settings.vbt-closing .vbt-s-dialog{animation:vbt-pop-out .17s ease-in both;}
#vbt-settings .vbt-s-page.active{animation:vbt-page-in .22s ease-out both;}
#vbt-settings .vbt-s-tab,#vbt-settings .vbt-s-close,#vbt-settings .vbt-s-seg button,#vbt-settings .vbt-s-btn{transition:background-color .15s ease,color .15s ease;}
@media (prefers-reduced-motion:reduce){
  #vbt-settings,#vbt-settings *{animation-duration:.01ms !important;transition-duration:.01ms !important;}
}
@media (max-width:640px){
  #vbt-settings .vbt-s-main{flex-direction:column;}
  #vbt-settings .vbt-s-nav{width:auto;flex-direction:row;border-right:0;border-bottom:1px solid var(--vbt-line);overflow-x:auto;}
  #vbt-settings .vbt-s-tab{white-space:nowrap;}
}
`;
    const style = doc.createElement("style");
    style.id = VBT_SETTINGS_ID + "-style";
    style.textContent = css;
    doc.head.appendChild(style);

    const h = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };

    // Save + apply. `legacy` = settings that also need config_init() to re-apply.
    const commit = (key, legacy) => {
      user_data_api.set();
      apply_hide_buttons_css();
      if (key === "dark_mode") {
        darkModeSystem.apply();
        applyTheme();
      }
      if (legacy) config_api.config_init(user_data.language);
    };
    function applyTheme() {
      const o = doc.getElementById(VBT_SETTINGS_ID);
      if (o) o.setAttribute("data-theme", vbt_settings_theme());
    }

    const mkRow = (title, desc, tag) => {
      const row = h(tag || "div", "vbt-s-row");
      const txt = h("div", "vbt-s-text");
      txt.append(h("div", "vbt-s-title", title));
      if (desc) txt.append(h("div", "vbt-s-desc", desc));
      row.append(txt);
      return row;
    };

    const toggle = (it) => {
      const row = mkRow(it.label, it.desc, "label");
      const sw = h("span", "vbt-s-switch");
      const input = doc.createElement("input");
      input.type = "checkbox";
      sw.append(input, doc.createElement("i"));
      const get =
        it.get ||
        (() =>
          it.notOff
            ? user_data[it.key] !== "off"
            : user_data[it.key] === "on");
      input.checked = !!get();
      input.addEventListener("change", () => {
        if (it.set) it.set(input.checked);
        else {
          user_data[it.key] = input.checked ? "on" : "off";
          commit(it.key, it.legacy);
        }
        if (it.after) it.after(input.checked);
      });
      row.append(sw);
      return row;
    };

    const seg = (it) => {
      const row = mkRow(it.label, it.desc);
      const wrap = h("div", "vbt-s-seg");
      const btns = it.options.map(([label, value, needLogin]) => {
        const b = h("button", null, label);
        b.type = "button";
        if (needLogin && user_data.login !== true) b.disabled = true;
        b.addEventListener("click", () => {
          user_data[it.key] = value;
          commit(it.key, it.legacy);
          paint();
        });
        wrap.append(b);
        return [b, value];
      });
      const paint = () =>
        btns.forEach(([b, v]) => b.classList.toggle("on", user_data[it.key] === v));
      paint();
      row.append(wrap);
      return row;
    };

    const select = (it) => {
      const row = mkRow(it.label, it.desc);
      const sel = h("select", "vbt-s-select");
      for (const [label, value] of it.options) {
        const o = h("option", null, label);
        o.value = value;
        sel.append(o);
      }
      sel.value = String(it.get());
      sel.addEventListener("change", () => it.set(sel.value));
      row.append(sel);
      return row;
    };

    const button = (it) => {
      const row = mkRow(it.label, it.desc);
      const wrap = h("div", "vbt-s-actions");
      for (const b0 of it.buttons || [{ text: it.button, action: it.action }]) {
        const b = h("button", "vbt-s-btn" + (b0.alt ? " alt" : ""), b0.text);
        b.type = "button";
        b.addEventListener("click", () => b0.action(b));
        wrap.append(b);
      }
      row.append(wrap);
      return row;
    };

    const info = (it) => {
      const row = mkRow(it.label, it.desc);
      const v = h("div", "vbt-s-val" + (it.cls ? " " + it.cls() : ""), String(it.value()));
      row.append(v);
      return row;
    };

    // diagnostics report (hidden until requested)
    const diagPre = h("pre", "vbt-s-pre");
    const diagNode = h("div");
    diagNode.append(diagPre);

    // ---- quality / speed ----
    function applyQualityPreference() {
      try {
        if (!user_data.default_quality || user_data.default_quality === "off") return;
        const player = document.querySelector(".html5-video-player");
        const video = document.querySelector("video");
        if (!player || !video) return;
        const levels = player.getAvailableQualityLevels?.();
        if (!levels || levels.length === 0) return;
        const startIndex = QUALITY_ORDER.indexOf(user_data.default_quality);
        const candidates =
          startIndex >= 0 ? QUALITY_ORDER.slice(startIndex) : QUALITY_ORDER;
        const chosen =
          candidates.find((q) => levels.includes(q)) || levels[levels.length - 1];
        if (chosen && player.getPlaybackQualityLabel?.() !== chosen) {
          player.setPlaybackQualityRange?.(chosen, chosen);
        }
      } catch (e) {}
    }
    function applySpeedPreference() {
      try {
        if (!user_data.default_speed) return;
        const video = document.querySelector("video");
        if (!video) return;
        const s = parseFloat(user_data.default_speed);
        if (isFinite(s)) video.playbackRate = s;
      } catch (e) {}
    }

    // ---- SponsorBlock categories (sub-list under the SponsorBlock toggle) ----
    const SB_LABELS = {
      sponsor: ["Sponsor", "#00d400"],
      intro: ["Intro / Intermission", "#00ffff"],
      outro: ["Outro / Credits", "#0202ed"],
      selfpromo: ["Self-promotion", "#ffff00"],
      interaction: ["Interaction reminder", "#cc00ff"],
      music_offtopic: ["Music: non-music section", "#ff9900"],
    };
    const sbBox = h("div", "vbt-s-sub");
    const sbRows = [];
    for (const [id, [label, color]] of Object.entries(SB_LABELS)) {
      const row = h("label", "vbt-s-row");
      const t = h("div", "vbt-s-title");
      const dot = h("span", "vbt-s-dot");
      dot.style.background = color;
      t.append(dot, label);
      const sw = h("span", "vbt-s-switch");
      const input = doc.createElement("input");
      input.type = "checkbox";
      input.checked = (user_data.sb_categories?.[id] ?? "on") === "on";
      input.addEventListener("change", () => {
        if (!user_data.sb_categories) user_data.sb_categories = {};
        user_data.sb_categories[id] = input.checked ? "on" : "off";
        user_data_api.set();
        sb_segmentCache.clear();
      });
      sw.append(input, doc.createElement("i"));
      row.append(t, sw);
      sbBox.append(row);
      sbRows.push(row);
    }
    const refreshSb = () =>
      sbRows.forEach((r) =>
        r.classList.toggle("disabled", user_data.sponsorblock !== "on"),
      );
    refreshSb();

    const hide = (key, label, desc) => ({ t: "toggle", key, label, desc });
    const ON_OFF = [["On", "on"], ["Off", "off"]];
    const ON_OFF_SUB = [["On", "on"], ["Off", "off"], ["Only subscribed", "subscribed", true]];
    const gridOpts = [["3 (Default)", "3"], ["4", "4"], ["5", "5"]];
    const grid = (key, label) => ({
      t: "select",
      label,
      options: gridOpts,
      get: () => user_data[key] || 3,
      set: (v) => {
        user_data[key] = parseInt(v, 10);
        user_data_api.set();
        gridUpdatePageLayout();
      },
    });

    const tabs = [
      {
        id: "general",
        label: "General",
        icon: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
        sections: [
          {
            title: "Appearance",
            items: [
              { t: "seg", key: "dark_mode", legacy: true, label: "Dark mode", desc: "Follow the system, or force the theme on or off", options: [["Auto", "auto"], ["On", "on"], ["Off", "off"]] },
              { t: "toggle", key: "disable_saturated_hover", legacy: true, label: "Disable saturated hover", desc: "Removes the coloured hover tint and button backgrounds" },
            ],
          },
          {
            title: "Home & feed",
            items: [
              grid("grid_content_per_row", "Videos per row"),
              grid("grid_news_per_row", "News per row"),
              grid("grid_shorts_per_row", "Shorts per row"),
              hide("show_full_video_title", "Show full video titles"),
              hide("hide_grid_avatar", "Hide channel avatars (home grid)"),
              hide("hide_views", "Hide views", "Hides the view count in video cards"),
              hide("hide_thumbnail_badges", "Hide thumbnail badges", "New, 4K and similar badges"),
              { t: "toggle", key: "disable_play_on_hover", legacy: true, label: "Disable play on hover", desc: "Stops video previews playing when hovering a thumbnail" },
              hide("hide_microphone_icon", "Hide microphone icon"),
            ],
          },
          {
            title: "Recommendations",
            items: [
              { t: "seg", key: "open_recommend_shorts", legacy: true, label: "Shorts recommendations", options: ON_OFF_SUB },
              { t: "seg", key: "open_recommend_liveroom", legacy: true, label: "Live recommendations", options: ON_OFF_SUB },
              { t: "seg", key: "open_recommend_movie", legacy: true, label: "Movie recommendations", options: ON_OFF },
              { t: "seg", key: "open_recommend_popular", legacy: true, label: "Trending", options: ON_OFF },
              { t: "seg", key: "open_recommend_playables", legacy: true, label: "Playables recommendations", options: ON_OFF },
            ],
          },
          {
            title: "Shorts",
            items: [
              { t: "toggle", key: "global_shorts_block", legacy: true, label: "Block all Shorts" },
              { t: "toggle", key: "add_shorts_upload_date", legacy: true, label: "Show Shorts upload time" },
              { t: "toggle", key: "shorts_change_author_name", legacy: true, label: "Show channel name instead of username" },
              { t: "toggle", key: "short_buy_super_thanks", legacy: true, label: "Show Buy Super Thanks" },
              { t: "toggle", key: "shorts_disable_loop_play", legacy: true, label: "Disable loop play" },
              { t: "toggle", key: "shorts_auto_scroll", legacy: true, label: "Auto-scroll to next Short" },
              { t: "toggle", key: "shorts_add_video_progress", legacy: true, notOff: true, label: "Add video progress bar" },
              { t: "toggle", key: "shorts_dbclick_like", legacy: true, label: "Double-click to like" },
            ],
          },
        ],
      },
      {
        id: "watch",
        label: "Watch Page",
        icon: "M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zm-5-6l-7 4V7z",
        sections: [
          {
            title: "Action bar buttons",
            items: [
              hide("hide_ask_button", "Hide Ask (Gemini)"),
              hide("hide_download_button", "Hide Download"),
              hide("hide_share_button", "Hide Share"),
              hide("hide_thanks_button", "Hide Thanks"),
              hide("hide_clip_button", "Hide Clip"),
              hide("hide_save_button", "Hide Save to playlist"),
              hide("hide_more_actions_button", "Hide More actions"),
              hide("hide_subscribe_button", "Hide Subscribe + Bell"),
              hide("hide_like_bar", "Hide Like/Dislike bar"),
              hide("hide_join_button", "Hide Join"),
            ],
          },
          {
            title: "Page extras",
            items: [
              hide("hide_ai_summary", "Hide AI summaries"),
              {
                t: "toggle",
                label: "Hide live chat replay teaser",
                get: () => user_data.watch_page_config?.hide_live_chat_replay === "on",
                set: (on) => {
                  if (!user_data.watch_page_config) user_data.watch_page_config = {};
                  user_data.watch_page_config.hide_live_chat_replay = on ? "on" : "off";
                  user_data_api.set();
                  if (on) hide_teaser_carousel();
                  else {
                    const n = doc.querySelector("#teaser-carousel");
                    if (n) n.style.display = "";
                  }
                },
              },
              { t: "toggle", key: "restore_related_sidebar_layout", legacy: true, label: "Restore related sidebar layout" },
            ],
          },
        ],
      },
      {
        id: "player",
        label: "Player",
        icon: "M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
        sections: [
          {
            title: "Playback",
            items: [
              {
                t: "select",
                label: "Default quality",
                options: [["Off", "off"], ["4K", "hd2160"], ["1440p", "hd1440"], ["1080p", "hd1080"], ["720p", "hd720"], ["480p", "large"], ["360p", "medium"], ["240p", "small"], ["144p", "tiny"]],
                get: () => user_data.default_quality || "off",
                set: (v) => {
                  user_data.default_quality = v;
                  user_data_api.set();
                  applyQualityPreference();
                },
              },
              {
                t: "select",
                label: "Default speed",
                options: [["0.25x", "0.25"], ["0.5x", "0.5"], ["0.75x", "0.75"], ["1x", "1"], ["1.25x", "1.25"], ["1.5x", "1.5"], ["1.75x", "1.75"]],
                get: () => user_data.default_speed || "1",
                set: (v) => {
                  user_data.default_speed = v;
                  user_data_api.set();
                  applySpeedPreference();
                },
              },
              { t: "toggle", key: "sponsorblock", legacy: true, label: "SponsorBlock: skip sponsors", desc: "Automatically skip segments using the SponsorBlock API", after: refreshSb },
              { t: "node", node: sbBox },
            ],
          },
          {
            title: "Player look & overlays",
            items: [
              { t: "toggle", key: "old_player_ui", label: "Old player UI", desc: "Needs a page reload to take effect", after: () => { if (confirm("Old Player UI requires a page reload to take effect. Reload now?")) unsafeWindow.location.reload(); } },
              hide("restore_red_progress_bar", "Restore red progress bar"),
              hide("hide_end_cards", "Hide end cards (overlay)"),
              hide("hide_fullscreen_controls", "Hide fullscreen controls"),
              hide("hide_paid_promotion", "Hide paid promotion overlay"),
            ],
          },
        ],
      },
      {
        id: "advanced",
        label: "Advanced",
        bottom: true,
        icon: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
        sections: [
          {
            title: "Backup",
            items: [
              { t: "button", label: "Settings backup", desc: "Export your settings to a .vbt file, or restore them from one", buttons: [{ text: "Export", alt: true, action: vbt_export_settings }, { text: "Import", alt: true, action: vbt_import_settings }] },
              { t: "button", label: "Reset all settings", desc: "Restores every setting to its default and reloads the page", button: "Reset", action: () => user_data_api.reset() },
            ],
          },
          {
            title: "Information",
            items: [
              { t: "info", label: "Version", value: () => { try { return GM_info.script.version; } catch (e) { return "unknown"; } } },
              { t: "info", label: "Status", value: vbt_status_text, cls: () => (isinint && error_messages.length === 0 ? "ok" : "bad") },
              { t: "info", label: "Page", value: () => page_type },
              { t: "info", label: "Browser", value: () => browser_info.name + " " + browser_info.version },
              { t: "info", label: "Account", value: vbt_mask_channel_id },
              {
                t: "button",
                label: "Diagnostics report",
                desc: "Full technical details, useful when reporting a problem",
                buttons: [
                  {
                    text: "Show",
                    alt: true,
                    action: (b) => {
                      const open = !diagPre.classList.contains("open");
                      if (open) diagPre.textContent = vbt_diagnostics_text();
                      diagPre.classList.toggle("open", open);
                      b.textContent = open ? "Hide" : "Show";
                    },
                  },
                  {
                    text: "Copy",
                    alt: true,
                    action: (b) => {
                      const ok = vbt_copy_text(vbt_diagnostics_text());
                      b.textContent = ok ? "Copied" : "Failed";
                      setTimeout(() => (b.textContent = "Copy"), 1500);
                    },
                  },
                ],
              },
              { t: "node", node: diagNode },
            ],
          },
        ],
      },
    ];

    // ---- assemble ----
    const overlay = h("div");
    overlay.id = VBT_SETTINGS_ID;
    overlay.setAttribute("data-theme", vbt_settings_theme());
    const dialog = h("div", "vbt-s-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "vBlockTube settings");

    const head = h("div", "vbt-s-head");
    const title = h("h2", null, "vBlockTube Settings");
    try {
      title.append(h("small", null, "v" + GM_info.script.version));
    } catch (e) {}
    const closeBtn = h("button", "vbt-s-close", "\u00d7");
    closeBtn.type = "button";
    closeBtn.title = "Close";
    head.append(title, closeBtn);

    const main = h("div", "vbt-s-main");
    const nav = h("div", "vbt-s-nav");
    const content = h("div", "vbt-s-content");
    const tabButtons = {};
    const pages = {};

    const build = { toggle, seg, select, button, info };
    for (const tab of tabs) {
      const tb = h("button", "vbt-s-tab");
      tb.type = "button";
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", tab.icon);
      svg.append(path);
      tb.append(svg, tab.label);
      tb.addEventListener("click", () => showTab(tab.id));
      if (tab.bottom) nav.append(h("div", "vbt-s-spacer"));
      nav.append(tb);
      tabButtons[tab.id] = tb;

      const page = h("div", "vbt-s-page");
      for (const sec of tab.sections) {
        const s = h("div", "vbt-s-section");
        s.append(h("h3", null, sec.title));
        for (const it of sec.items) {
          if (!it) continue;
          s.append(it.t === "node" ? it.node : build[it.t](it));
        }
        page.append(s);
      }
      content.append(page);
      pages[tab.id] = page;
    }

    function showTab(id) {
      if (!pages[id]) id = "general";
      for (const k of Object.keys(pages)) {
        pages[k].classList.toggle("active", k === id);
        tabButtons[k].classList.toggle("active", k === id);
      }
      content.scrollTop = 0;
    }

    main.append(nav, content);

    const foot = h("div", "vbt-s-foot");
    foot.append("Dislike counts by ");
    const a = h("a", null, "returnyoutubedislike.com");
    a.href = "https://returnyoutubedislike.com";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    foot.append(a);

    dialog.append(head, main, foot);
    overlay.append(dialog);
    doc.body.appendChild(overlay);
    showTab(initialTab || "general");

    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      doc.removeEventListener("keydown", onKey, true);
      overlay.classList.add("vbt-closing"); // play the exit animation first
      setTimeout(() => {
        overlay.remove();
        style.remove();
      }, 180);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    doc.addEventListener("keydown", onKey, true);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });
  }

  /* Settings button in the masthead, right after the microphone button */
  function init_settings_button() {
    if (unsafeWindow.location.hostname !== "www.youtube.com") return;
    const doc = unsafeWindow.document;
    if (unsafeWindow.__vbt_settings_btn) return;
    unsafeWindow.__vbt_settings_btn = true;

    const style = doc.createElement("style");
    style.textContent = `
      #vbt-settings-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;margin-left:8px;padding:0;border:0;border-radius:50%;cursor:pointer;background:rgba(0,0,0,.05);color:#0f0f0f;}
      #vbt-settings-btn:hover{background:rgba(0,0,0,.1);}
      #vbt-settings-btn[data-dark]{background:rgba(255,255,255,.1);color:#f1f1f1;}
      #vbt-settings-btn[data-dark]:hover{background:rgba(255,255,255,.2);}
      #vbt-settings-btn svg{width:24px;height:24px;fill:currentColor;pointer-events:none;}
    `;
    (doc.head || doc.documentElement).appendChild(style);

    const GEAR =
      "M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z";

    const makeBtn = () => {
      const b = doc.createElement("button");
      b.id = "vbt-settings-btn";
      b.type = "button";
      b.title = "vBlockTube settings";
      b.setAttribute("aria-label", "vBlockTube settings");
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      const p = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", GEAR);
      svg.append(p);
      b.append(svg);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        display_settings_win("general");
      });
      return b;
    };

    let raf = 0;
    const ensure = () => {
      raf = 0;
      const mic = doc.querySelector("ytd-masthead #voice-search-button");
      if (!mic) return;
      let btn = doc.getElementById("vbt-settings-btn");
      if (btn && btn.previousElementSibling === mic) return;
      if (!btn) btn = makeBtn();
      mic.after(btn);
      syncTheme();
    };
    const syncTheme = () => {
      const btn = doc.getElementById("vbt-settings-btn");
      if (!btn) return;
      if (vbt_page_is_dark()) btn.setAttribute("data-dark", "");
      else btn.removeAttribute("data-dark");
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(ensure);
    };
    new MutationObserver(schedule).observe(doc.documentElement, {
      childList: true,
      subtree: true,
    });
    unsafeWindow.addEventListener("yt-navigate-finish", schedule, { passive: true });
    unsafeWindow.addEventListener("yt-dark-mode-toggled", () => setTimeout(syncTheme, 150));
    new MutationObserver(syncTheme).observe(doc.documentElement, {
      attributes: true,
      attributeFilter: ["dark"],
    });
    unsafeWindow.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(syncTheme, 150));
    schedule();
  }

  /* ====== HIDE-ELEMENTS CSS ====== */

  function apply_hide_buttons_css() {
    const rules = [];

    if (user_data.hide_ask_button === "on") {
      rules.push('button[aria-label="Ask"] { display: none !important; }');
    }

    if (user_data.hide_download_button === "on") {
      rules.push('button[aria-label="Download"] { display: none !important; }');
    }

    if (user_data.hide_share_button === "on") {
      rules.push(
        "#actions #menu ytd-menu-renderer > yt-button-view-model { display: none !important; }",
      );
      rules.push('button[aria-label="Share"] { display: none !important; }');
    }

    if (user_data.hide_thanks_button === "on") {
      rules.push('button[aria-label="Thanks"] { display: none !important; }');
    }

    if (user_data.hide_clip_button === "on") {
      rules.push('button[aria-label="Clip"] { display: none !important; }');
    }

    if (user_data.hide_more_actions_button === "on") {
      rules.push(
        "#actions #menu ytd-menu-renderer yt-button-shape#button-shape { display: none !important; }",
      );
      rules.push(
        '#actions #menu ytd-menu-renderer button[aria-label="More actions"] { display: none !important; }',
      );
    }

    if (user_data.hide_save_button === "on") {
      rules.push(
        'button[aria-label="Save to playlist"] { display: none !important; }',
      );
    }

    if (user_data.hide_subscribe_button === "on") {
      rules.push("#subscribe-button { display: none !important; }");
    }

    if (user_data.hide_like_bar === "on") {
      rules.push(
        ".ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper { display: none !important; }",
      );
    }

    if (user_data.hide_join_button === "on") {
      rules.push("#sponsor-button { display: none !important; }");
    }

    // Always hide "Explore more topics" — target parent section to eliminate blank space
    rules.push("ytd-rich-section-renderer:has(.ytdChipsShelfWithVideoShelfRendererHost) { display: none !important; }");

    if (user_data.hide_fullscreen_controls === "on") {
      rules.push(
        "#movie_player .ytp-overlay-top-right { display: none !important; }",
      );
      rules.push(
        "#movie_player .ytp-fullscreen-quick-actions { display: none !important; }",
      );
      rules.push(
        "player-fullscreen-action-menu .action-menu-engagement-buttons-wrapper { display: none !important; }",
      );
    }

    if (user_data.hide_ai_summary === "on") {
      rules.push(
        "#expandable-metadata:has(path[d*='gemini' i]) { display: none !important; }",
      );
      rules.push(
        "#video-summary.ytd-structured-description-content-renderer { display: none !important; }",
      );
      rules.push(
        "ytm-expandable-metadata-renderer:has(path[d*='gemini' i]) { display: none !important; }",
      );
      // New in v1.9.1: hide AI summary in search results
      rules.push(
        "ytd-expandable-metadata-renderer[has-video-summary] { display: none !important; }",
      );
      rules.push(
        "#expandable-metadata:has(video-summary-content-view-model) { display: none !important; }",
      );
      rules.push(
        "#expandable-metadata:has(ytd-expandable-metadata-renderer) { display: none !important; }",
      );
    }

    if (user_data.hide_microphone_icon === "on") {
      rules.push(
        'button[aria-label*="Search with your voice" i] { display: none !important; }',
      );
      rules.push(
        'button[aria-label*="Voice search" i] { display: none !important; }',
      );
      rules.push(
        '.ytd-topbar-logo-button-renderer button[aria-label*="mic" i] { display: none !important; }',
      );
      rules.push(
        "ytm-topbar-search-input-renderer .search-microphone { display: none !important; }",
      );
    }

    if (user_data.hide_grid_avatar === "on") {
      rules.push(".ytLockupMetadataViewModelAvatar { display: none !important; }");
    }

    // Hide the view count completely in metadata rows (new layout): the play
    // icon, the "13M" text and the delimiter that follows it, so no stray
    // separator is left behind.
    if (user_data.hide_views === "on") {
      const VIEWS_ICON_PATH =
        "M5 4.623v14.755a1.5 1.5 0 002.261 1.294l12.766-7.51L22 12.002l-1.973-1.162L7.26 3.33A1.5 1.5 0 005 4.623Zm2 13.88V5.497L18.056 12 7 18.503Z";
      const ICON = `.ytContentMetadataViewModelLeadingIcon:has(path[d="${VIEWS_ICON_PATH}"])`;
      rules.push(`
        /* icon + view count text + the delimiter after it */
        ${ICON},
        ${ICON} + .ytContentMetadataViewModelMetadataText,
        ${ICON} + .ytContentMetadataViewModelMetadataText + .ytContentMetadataViewModelDelimiter,
        /* fallback if the icon is missing or changes (English labels) */
        .ytContentMetadataViewModelMetadataText[aria-label$=" views" i],
        .ytContentMetadataViewModelMetadataText[aria-label$=" views" i] + .ytContentMetadataViewModelDelimiter,
        .ytContentMetadataViewModelMetadataText[aria-label$=" view" i],
        .ytContentMetadataViewModelMetadataText[aria-label$=" view" i] + .ytContentMetadataViewModelDelimiter {
          display: none !important;
        }
      `);
    }

    // Ported from Control Panel for YouTube v1.36.0: hide thumbnail badges
    // (New, 4K, etc.) in Related videos and search results.
    if (user_data.hide_thumbnail_badges === "on") {
      [
        // Desktop - Related: old (under metadata) and new (thumbnail overlay)
        "#related ytd-badge-supported-renderer",
        "#related yt-thumbnail-overlay-badge-view-model",
        // Desktop - Search
        "ytd-search ytd-badge-supported-renderer#badges",
        // Mobile - Related and Search
        'ytm-item-section-renderer[section-identifier="related-items"] .ytmBadgeAndBylineRendererItemBadge',
        "ytm-search .ytmBadgeAndBylineRendererItemBadge",
      ].forEach((selector) => {
        rules.push(`${selector} { display: none !important; }`);
      });
    }

    if (user_data.show_full_video_title === "on") {
      rules.push(`
        /* Home grid, search results, related sidebar — new lockup */
        .yt-lockup-metadata-view-model__title,
        .yt-lockup-metadata-view-model__title a,
        .ytLockupMetadataViewModelTitle,
        .ytLockupMetadataViewModelTitle a,
        /* Legacy #video-title spans */
        #video-title.ytd-rich-grid-media,
        #video-title.ytd-compact-video-renderer,
        #video-title.ytd-video-renderer,
        #video-title.ytd-grid-video-renderer,
        #video-title {
          -webkit-line-clamp: unset !important;
          line-clamp: unset !important;
          max-height: unset !important;
          overflow: visible !important;
          white-space: normal !important;
        }
      `);
    }

    // Auto multi-line metadata row (channel, collab names, views, upload time).
    // YouTube keeps this row on one line and clips it, which hides the channel
    // name / date when the grid is set to 4 or 5 per row. Let it wrap instead,
    // so it adapts to any grid size automatically.
    rules.push(`
        ytd-rich-item-renderer .ytLockupMetadataViewModelTextContainer,
        ytd-rich-item-renderer .ytLockupMetadataViewModelMetadata,
        ytd-rich-item-renderer yt-content-metadata-view-model {
          max-height: none !important;
          height: auto !important;
          overflow: visible !important;
        }
        ytd-rich-item-renderer .ytContentMetadataViewModelMetadataRow {
          display: flex !important;
          flex-wrap: wrap !important;
          align-items: center !important;
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          max-height: none !important;
          height: auto !important;
        }
        ytd-rich-item-renderer .ytContentMetadataViewModelMetadataText {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          flex: 0 1 auto !important;
        }
        ytd-rich-item-renderer .ytContentMetadataViewModelIcon,
        ytd-rich-item-renderer .ytContentMetadataViewModelLeadingIcon,
        ytd-rich-item-renderer .ytContentMetadataViewModelDelimiter {
          flex-shrink: 0 !important;
        }
      `);

    if (user_data.hide_paid_promotion === "on") {
      rules.push(
        ".ytp-paid-content-overlay { display: none !important; }",
      );
      rules.push(
        ".ytp-paid-content-overlay-link { display: none !important; }",
      );
      rules.push(
        ".YtmPaidContentOverlayHost { display: none !important; }",
      );
      rules.push(
        "ytm-paid-content-overlay-renderer { display: none !important; }",
      );
      rules.push(
        '[class*="paid-content-overlay"] { display: none !important; }',
      );
    }

    rules.push(`
        #cpfyt-miniplayer-button {
          display: inline-block !important;
          anchor-name: --cpfyt-miniplayer-anchor;
        }
        #cpfyt-miniplayer-button + .ytp-tooltip {
          display: block !important;
          position: fixed !important;
          position-anchor: --cpfyt-miniplayer-anchor;
          bottom: anchor(top);
          left: anchor(center);
          translate: -50% -14px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .ytp-delhi-modern #cpfyt-miniplayer-button + .ytp-tooltip {
          translate: -50% -22px;
        }
        #cpfyt-miniplayer-button:hover + .ytp-tooltip {
          opacity: 1;
        }
        #cpfyt-miniplayer-button + .ytp-tooltip .ytp-tooltip-text {
          font-size: 13px;
          white-space: pre;
        }
      `);

    let css = rules.join("\n");
    let styleEl = unsafeWindow.document.getElementById("yt-hide-buttons-style");
    if (!styleEl) {
      styleEl = unsafeWindow.document.createElement("style");
      styleEl.id = "yt-hide-buttons-style";
      unsafeWindow.document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }

  function init_disable_ambient_mode() {
    const MAX_RETRIES = 10;
    const WAIT_MS = 500;

    const waitForElement = (selector) => {
      let timeout = MAX_RETRIES;

      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          const el = selector();
          if (el) {
            clearInterval(interval);
            resolve(el);
          }
          if (timeout-- <= 0) {
            clearInterval(interval);
            reject("timeout");
          }
        }, WAIT_MS);
      });
    };

    const runScript = () => {
      waitForElement(() =>
        unsafeWindow.document.querySelector(
          "[data-tooltip-target-id=ytp-settings-button]",
        ),
      )
        .then((cog) => {
          cog.click();
          cog.click();

          const getAmbientMode = () =>
            Array.from(
              unsafeWindow.document.getElementsByClassName("ytp-menuitem"),
            ).find((e) => e.innerText.toLowerCase().includes("ambient mode"));

          waitForElement(getAmbientMode)
            .then((el) => {
              if (el.ariaChecked === "true") {
                el.click();
              }
            })
            .catch((e) => {});
        })
        .catch((e) => {
          log("Couldn't find settings cog", 0);
        });
    };

    if (
      unsafeWindow.location.href.includes("youtube.com/watch") ||
      unsafeWindow.location.href.includes("youtube.com/shorts")
    ) {
      runScript();
    }
  }

})();