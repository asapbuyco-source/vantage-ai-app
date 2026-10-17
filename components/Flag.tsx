import React from 'react';
import { FR, GB, MX, BR, CM, CI, SN, NG, KE, GH, ZA } from 'country-flag-icons/react/3x2';

// SVG flags (country-flag-icons) — render reliably on every device/WebView,
// unlike emoji flags which show as letter pairs on Windows and some Android builds.
// Supports both language codes (en/es/pt) and country codes (gb, cm, ...).
const FLAGS: Record<string, React.ComponentType<any>> = {
  fr: FR,
  en: GB,
  gb: GB,
  es: MX,
  mx: MX,
  pt: BR,
  br: BR,
  cm: CM,
  ci: CI,
  sn: SN,
  ng: NG,
  ke: KE,
  gh: GH,
  za: ZA,
};

export const hasFlag = (code: string): boolean => Boolean(FLAGS[code]);

export const Flag: React.FC<{ code: string; className?: string; title?: string }> = ({ code, className, title }) => {
  const C = FLAGS[code];
  if (!C) return null;
  return <C className={className} title={title} />;
};
