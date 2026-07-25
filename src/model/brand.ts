// Where the app calls itself by name. Kept in one place so the canvas
// watermark, the PDF credit and the QR target can never drift apart — a QR
// pointing at a URL the page no longer serves is worse than no QR at all.
//
// APP_URL must stay in sync with the canonical link in index.html.

export const APP_NAME = "Mirror Wall Studio";
export const APP_URL = "https://agasy18.github.io/mirror-wall-studio/";

/** The URL without its scheme — what reads best printed next to a QR code. */
export const APP_URL_LABEL = APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
