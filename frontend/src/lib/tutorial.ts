// New members see the platform tutorial before anything else; this remembers they've been through it.
const KEY = "hz-tutorial-v1";

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage blocked */
  }
}
