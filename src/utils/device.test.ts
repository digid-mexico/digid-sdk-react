import { describe, it, expect } from 'vitest';
import { isMobileDeviceUA, isIOS, shouldMirrorPreview } from './device';

// Port del prototipo KYC (Task 22): tests de isMobileDeviceUA/isIOS/shouldMirrorPreview,
// que porta device.js del prototipo. canAttemptSelfieVideo (selfieRecorder.js) no está
// en el alcance de este task (scanRecorder/selfieRecorder quedan para el task de UI).

type FakeNav = Partial<Navigator> & { userAgentData?: { mobile?: boolean } };

const NAV_IPHONE: FakeNav = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5
};

const NAV_ANDROID: FakeNav = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  userAgentData: { mobile: true },
  maxTouchPoints: 5
};

const NAV_ANDROID_TABLET: FakeNav = {
  // Tablets Android reportan userAgentData.mobile = false; el UA sigue
  // diciendo Android.
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  userAgentData: { mobile: false },
  maxTouchPoints: 5
};

const NAV_IPAD: FakeNav = {
  // iPadOS se anuncia como Macintosh; se distingue por el multi-touch.
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  maxTouchPoints: 5
};

const NAV_MAC: FakeNav = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  userAgentData: { mobile: false },
  maxTouchPoints: 0
};

describe('isMobileDeviceUA', () => {
  it('iPhone y Android son moviles', () => {
    expect(isMobileDeviceUA(NAV_IPHONE as Navigator)).toBe(true);
    expect(isMobileDeviceUA(NAV_ANDROID as Navigator)).toBe(true);
  });
  it('tablets tambien (Android tablet e iPadOS-como-Macintosh)', () => {
    expect(isMobileDeviceUA(NAV_ANDROID_TABLET as Navigator)).toBe(true);
    expect(isMobileDeviceUA(NAV_IPAD as Navigator)).toBe(true);
  });
  it('una Mac de escritorio no es movil', () => {
    expect(isMobileDeviceUA(NAV_MAC as Navigator)).toBe(false);
  });
  it('sin navigator no revienta', () => {
    expect(isMobileDeviceUA(undefined)).toBe(false);
  });
});

describe('isIOS', () => {
  it('iPhone e iPad (incluido iPadOS-como-Macintosh) son iOS', () => {
    expect(isIOS(NAV_IPHONE as Navigator)).toBe(true);
    expect(isIOS(NAV_IPAD as Navigator)).toBe(true);
  });
  it('Android y Mac de escritorio no', () => {
    expect(isIOS(NAV_ANDROID as Navigator)).toBe(false);
    expect(isIOS(NAV_MAC as Navigator)).toBe(false);
  });
});

describe('shouldMirrorPreview', () => {
  it('camara FRONTAL de un movil: SIN espejo', () => {
    expect(shouldMirrorPreview({ facingMode: 'user' }, NAV_IPHONE as Navigator)).toBe(false);
    expect(shouldMirrorPreview({ facingMode: 'user' }, NAV_ANDROID as Navigator)).toBe(false);
  });
  it('camara trasera: sin espejo en cualquier dispositivo', () => {
    expect(shouldMirrorPreview({ facingMode: 'environment' }, NAV_ANDROID as Navigator)).toBe(false);
    expect(shouldMirrorPreview({ facingMode: 'environment' }, NAV_MAC as Navigator)).toBe(false);
  });
  it('movil sin facingMode reportado: sin espejo', () => {
    expect(shouldMirrorPreview({}, NAV_IPHONE as Navigator)).toBe(false);
  });
  it('webcam de escritorio: espejo (comportamiento historico)', () => {
    expect(shouldMirrorPreview({ facingMode: 'user' }, NAV_MAC as Navigator)).toBe(true);
    expect(shouldMirrorPreview({}, NAV_MAC as Navigator)).toBe(true);
    expect(shouldMirrorPreview(undefined, NAV_MAC as Navigator)).toBe(true);
  });
});
