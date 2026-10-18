// Creates the ₦2,500/month Paystack plan (if missing) and stores its code in `plans`.
//   npm run paystack:setup
import { db } from "../src/lib/supabase.js";
import { paystack } from "../src/services/paystack.js";

const NAME = "Huzzler Monthly";
const AMOUNT = 250000; // kobo
const plans = await paystack.listPlans();
let plan = plans.find((p) => p.name === NAME && p.amount === AMOUNT && p.interval === "monthly");
if (!plan) {
  const created = await paystack.createPlan({ name: NAME, interval: "monthly", amount: AMOUNT, currency: "NGN" });
  plan = { plan_code: created.plan_code, name: NAME, amount: AMOUNT, interval: "monthly" };
  console.log(`Created Paystack plan ${plan.plan_code}`);
} else {
  console.log(`Found existing Paystack plan ${plan.plan_code}`);
}
const { error } = await db.from("plans").update({ paystack_plan_code: plan.plan_code }).eq("id", "monthly");
if (error) throw error;
console.log("Saved plan code to plans.monthly");
