// Cookie consent utility — analytics only fires when the user has explicitly accepted
// Customize the CONSENT_KEY if you already use a different cookie consent system

const CONSENT_KEY = "sa-consent";

export type ConsentStatus = "accepted" | "declined" | null;

export function getConsent(): ConsentStatus {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === "accepted" || val === "declined") return val;
  return null;
}

export function setConsent(status: "accepted" | "declined") {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, status);
}

export function hasConsented(): boolean {
  return getConsent() === "accepted";
}
