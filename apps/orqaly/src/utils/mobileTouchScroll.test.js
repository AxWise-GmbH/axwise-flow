import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  APP_SHELL_ROOT_SX,
  getAppMainScrollSx,
  getHeroInputFontSize,
  isCoarsePointer,
  LANDING_HORIZONTAL_CAROUSEL_SX,
  LANDING_PAGE_ROOT_SX,
  LANDING_PASS_VERTICAL_TOUCH_SX,
  MOBILE_INPUT_FONT_SIZE,
  PUBLIC_MAIN_SX,
  releaseBodyScrollLock,
  scrollAppShellToTop,
  shouldAutofocusTextInput,
  TOUCH_SCROLL_CONTAINER_SX,
} from './mobileTouchScroll.js';

describe('mobileTouchScroll', () => {
  it('TOUCH_SCROLL_CONTAINER_SX enables vertical touch pan', () => {
    expect(TOUCH_SCROLL_CONTAINER_SX.touchAction).toBe('pan-y');
    expect(TOUCH_SCROLL_CONTAINER_SX.WebkitOverflowScrolling).toBe('touch');
  });

  it('getAppMainScrollSx uses document scroll on xs and bounded pane on md', () => {
    const sx = getAppMainScrollSx({
      contentPadding: { xs: 1 },
      useSimpleDock: false,
      headerOffset: 76,
    });
    expect(sx.overflowY.xs).toBe('visible');
    expect(sx.overflowY.md).toBe('auto');
    expect(sx.overflowX.xs).toBe('clip');
    expect(sx.height.md).toBe('calc(100dvh - 76px)');
    expect(sx.touchAction).toBe('pan-y');
  });

  it('honours a shorter responsive header offset on phones', () => {
    const sx = getAppMainScrollSx({
      contentPadding: { xs: 1 },
      useSimpleDock: false,
      headerOffset: { xs: 68, sm: 76 },
    });
    expect(sx.mt).toEqual({ xs: '68px', sm: '76px' });
    expect(sx.height.md).toBe('calc(100dvh - 76px)');
  });

  it('landing sx helpers separate vertical page scroll from horizontal carousels', () => {
    expect(LANDING_PAGE_ROOT_SX.touchAction).toBe('pan-y');
    expect(LANDING_PAGE_ROOT_SX.WebkitOverflowScrolling).toBeUndefined();
    expect(LANDING_PAGE_ROOT_SX['@media (hover: hover) and (pointer: fine)'].overflowX).toBe(
      'clip'
    );
    expect(LANDING_PASS_VERTICAL_TOUCH_SX.touchAction).toBe('pan-y');
    expect(LANDING_HORIZONTAL_CAROUSEL_SX.touchAction).toBe('pan-x');
  });

  it('getAppMainScrollSx adds bottom padding when simple dock is active', () => {
    const sx = getAppMainScrollSx({
      contentPadding: { xs: 0.75 },
      useSimpleDock: true,
      headerOffset: 76,
    });
    expect(sx.px).toBe(0);
    expect(sx.pb.xs).toBe('calc(80px + env(safe-area-inset-bottom, 0px))');
  });

  // Which element scrolls depends on the breakpoint, so opening a thread from
  // History has to ask both. Asking the window only worked on a phone and did
  // nothing on a desktop, where <main> is the bounded scroller.
  describe('scrollAppShellToTop', () => {
    let raf;

    beforeEach(() => {
      // Two nested frames before it runs; flatten them so the test is synchronous.
      raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb();
        return 0;
      });
    });

    afterEach(() => {
      raf.mockRestore();
      document.body.innerHTML = '';
    });

    it('scrolls both the document and the main pane', () => {
      const main = document.createElement('div');
      main.setAttribute('data-app-main', '');
      main.scrollTo = vi.fn();
      document.body.appendChild(main);
      const windowScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

      scrollAppShellToTop();

      expect(main.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      expect(windowScroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      windowScroll.mockRestore();
    });

    it('still scrolls the document when no main pane is mounted', () => {
      const windowScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      expect(() => scrollAppShellToTop()).not.toThrow();
      expect(windowScroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      windowScroll.mockRestore();
    });
  });

  it('PUBLIC_MAIN_SX keeps marketing main on document scroll', () => {
    expect(PUBLIC_MAIN_SX.touchAction).toBe('pan-y');
    expect(PUBLIC_MAIN_SX.overflow).toBe('visible');
  });

  it('releaseBodyScrollLock clears fixed body styles', () => {
    const windowScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    document.body.style.position = 'fixed';
    document.body.style.top = '-120px';
    document.body.style.overflow = 'hidden';
    releaseBodyScrollLock({ restoreY: 120 });
    expect(document.body.style.position).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(windowScroll).toHaveBeenCalledWith(0, 120);
    windowScroll.mockRestore();
  });

  it('APP_SHELL_ROOT_SX clips horizontal overflow', () => {
    expect(APP_SHELL_ROOT_SX.maxWidth).toBe('100%');
    expect(APP_SHELL_ROOT_SX.overflowX).toBe('clip');
  });

  describe('iOS input zoom helpers', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it('getHeroInputFontSize uses 16px on touch', () => {
      expect(getHeroInputFontSize(true)).toBe(MOBILE_INPUT_FONT_SIZE);
      expect(getHeroInputFontSize(false)).toBe('0.9375rem');
    });

    it('shouldAutofocusTextInput skips autofocus on coarse pointer', () => {
      window.matchMedia = vi.fn((query) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      expect(isCoarsePointer()).toBe(true);
      expect(shouldAutofocusTextInput()).toBe(false);
    });

    it('shouldAutofocusTextInput allows autofocus on fine pointer', () => {
      window.matchMedia = vi.fn(() => ({
        matches: false,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      expect(isCoarsePointer()).toBe(false);
      expect(shouldAutofocusTextInput()).toBe(true);
    });
  });
});
