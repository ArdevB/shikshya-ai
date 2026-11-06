/** The shared letterhead and styles for every PDF, in the brand colours. */

export interface Institution {
  name: string;
  address: string;
  phone: string;
  email: string;
  principalName: string;
  logoDataUrl: string | null;
}

/** Everything placed in a template goes through this, so data can never become markup. */
export const esc = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Calendar dates are stored as UTC midnight, so they are formatted in UTC to keep the day. */
export const dateText = (value: Date | string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));

/** A moment in time, in Nepal time. */
export const momentText = (value: Date | string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));

export const BASE_STYLES = `
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Inter, 'Segoe UI', Arial, sans-serif; color: #0B2B3A; font-size: 12px; line-height: 1.45; }
  h1, h2 { margin: 0; font-family: 'Space Grotesk', Inter, 'Segoe UI', Arial, sans-serif; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #E7F5FA; text-align: left; font-weight: 600; }
  th, td { padding: 7px 10px; border-bottom: 1px solid #D5E6ED; }
  .num { text-align: right; }
  .muted { color: #4A6472; }
`;

const DOCUMENT_STYLES = `
  ${BASE_STYLES}
  @page { margin: 0; }
  .page { padding: 36px 44px; }
  .letterhead { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 3px solid #0593C6; }
  .logo { width: 56px; height: 56px; object-fit: contain; }
  .logo-mark { width: 56px; height: 56px; border-radius: 12px; background: #0593C6; color: #FCFFFF; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; }
  .institution h1 { font-size: 20px; }
  .doc-title { margin: 22px 0 16px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .doc-title h2 { font-size: 18px; }
  .accent { color: #B02476; font-weight: 600; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 28px; margin-bottom: 18px; }
  .facts div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dashed #D5E6ED; padding: 3px 0; }
  .facts span:first-child { color: #4A6472; }
  .facts span:last-child { font-weight: 600; text-align: right; }
  .totals { width: 280px; margin: 14px 0 0 auto; }
  .totals td { border: 0; padding: 4px 10px; }
  .totals tr.grand td { border-top: 2px solid #0B2B3A; font-weight: 700; font-size: 14px; }
  .summary { display: flex; gap: 12px; margin-top: 16px; }
  .summary div { flex: 1; background: #E7F5FA; border-radius: 8px; padding: 10px 14px; }
  .summary b { display: block; font-size: 20px; }
  .signature { margin-top: 56px; display: flex; justify-content: flex-end; }
  .signature div { width: 220px; border-top: 1px solid #0B2B3A; padding-top: 6px; text-align: center; }
  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #D5E6ED; font-size: 10px; color: #4A6472; }
`;

export function letterhead(institution: Institution) {
  const contact = [institution.address, institution.phone, institution.email]
    .filter(Boolean)
    .map(esc)
    .join(' &middot; ');
  const logo = institution.logoDataUrl
    ? `<img class="logo" src="${esc(institution.logoDataUrl)}" alt="">`
    : `<div class="logo-mark">${esc(institution.name.charAt(0))}</div>`;
  return `<div class="letterhead">${logo}<div class="institution"><h1>${esc(institution.name)}</h1><div class="muted">${contact}</div></div></div>`;
}

export function documentPage(institution: Institution, title: string, content: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOCUMENT_STYLES}</style></head>
<body><div class="page">${letterhead(institution)}${content}</div></body></html>`;
}

export const factList = (facts: [string, string | number][]) =>
  `<div class="facts">${facts
    .map(([label, value]) => `<div><span>${esc(label)}</span><span>${esc(value)}</span></div>`)
    .join('')}</div>`;
