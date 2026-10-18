import { MIN_AGE, GUARDIAN_AGE } from "./constants.js";

export function ageOn(dob: Date, today = new Date()): number {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export type AgeCheck = { allowed: false; reason: string } | { allowed: true; needsGuardian: boolean; age: number };

export function checkAge(dob: Date, today = new Date()): AgeCheck {
  const age = ageOn(dob, today);
  if (Number.isNaN(age)) return { allowed: false, reason: "Invalid date of birth" };
  if (age < MIN_AGE) return { allowed: false, reason: `You must be at least ${MIN_AGE} to join Huzzler.` };
  if (age > 100) return { allowed: false, reason: "Please check your date of birth." };
  return { allowed: true, needsGuardian: age === GUARDIAN_AGE, age };
}
