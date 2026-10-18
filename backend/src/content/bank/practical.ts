// T2-T4 per role. `content` is shown to the candidate; `answer_key` never leaves the server.
export type BankItem = { title: string; kind: string; content: Record<string, unknown>; answer_key?: Record<string, unknown>; rubric_id?: string };

const JS_HARNESS = (cases: string) => `
;(function(){ const failures=[]; let passed=0; const cases=[${cases}];
for (const [name, fn] of cases) { try { if (fn()) passed++; else failures.push(name); } catch (e) { failures.push(name + ": " + e.message); } }
console.log(JSON.stringify({ passed, total: cases.length, failures })); })();`;

const AI = (rubric_id: string, instructions: string, brief: string, checks: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): BankItem => ({
  title: "",
  kind: "ai_rubric",
  rubric_id,
  content: { instructions, brief, ...extra },
  answer_key: { checks },
});

export const PRACTICAL: Record<string, { t2: BankItem; t3: BankItem; t4: BankItem }> = {
  product_manager: {
    t2: {
      title: "Prioritise a backlog",
      kind: "ranking",
      content: {
        instructions: "You're the PM for Kobo, a savings app for market traders in Lagos. Week-1 retention is 22% and the team has one sprint. Drag the items into the order you'd tackle them (most important first).",
        context: "Data: 61% of new users never make a first deposit. Top support complaint: 'I don't know if my money arrived'. 8% of users ask for dark mode. Fraud losses are low (0.1%).",
        items: [
          { id: "deposit_confirm", label: "Instant deposit confirmation (SMS + in-app)", detail: "Addresses top complaint" },
          { id: "first_deposit", label: "Guided first deposit flow", detail: "61% never deposit" },
          { id: "ussd", label: "USSD deposit option", detail: "For users with poor data" },
          { id: "referral", label: "Referral rewards", detail: "Growth" },
          { id: "dark_mode", label: "Dark mode", detail: "8% requested" },
          { id: "fraud_ml", label: "ML fraud detection", detail: "Losses 0.1%" },
          { id: "savings_goals", label: "Savings goals with progress bar", detail: "Engagement" },
          { id: "rebrand", label: "Refresh the logo", detail: "Marketing request" },
        ],
      },
      answer_key: { order: ["first_deposit", "deposit_confirm", "ussd", "savings_goals", "referral", "fraud_ml", "dark_mode", "rebrand"], rationale: "Activation (first deposit) and trust (confirmation) drive retention; access (USSD) next; growth before cosmetics." },
    },
    t3: AI(
      "product_manager.t3",
      "Write a mini PRD (400–900 words). Use the headings: Problem, Users, Goals & Success Metrics, Scope, Non-goals, Requirements (with acceptance criteria), Risks.",
      "Brief: Kobo users keep cash with 'ajo' collectors and don't trust the app with their savings yet. Leadership wants a 'Group Savings' feature so a trader can save with 5–10 people they already know. The team is 2 engineers, 1 designer and 1 QA for 4 weeks.",
      { min_words: 350, max_words: 1200, required_sections: ["Problem", "Users", "Scope", "Non-goals", "Requirements", "Metric"] },
    ),
    t4: AI(
      "product_manager.t4",
      "Define how you'd measure success (300–700 words): a primary metric with a precise definition, 2–3 guardrails, the data you'd need, baseline and target, and how long before you'd judge it.",
      "Case: Kobo launched Group Savings to 10% of users. In week one, 1,400 groups were created, but the average group made 1.3 contributions. Support tickets rose 18%. The CEO says 'it's a hit, look at the groups!'",
      { min_words: 250, max_words: 900 },
    ),
  },
  software_engineer: {
    t2: {
      title: "Fix the pagination bug",
      kind: "code_sandbox",
      content: {
        instructions: "Customers report that page 2 of their transactions repeats the last item from page 1, and the final page is sometimes missing. Fix `paginate` so all hidden tests pass. Keep the function signature.",
        language: "javascript",
        starter_code: "function paginate(items, page, pageSize) {\n  // page is 1-based\n  const start = (page - 1) * pageSize - 1;\n  const end = start + pageSize;\n  const totalPages = Math.floor(items.length / pageSize);\n  return { data: items.slice(start, end), page, totalPages };\n}\n",
        visible_tests: "paginate([1,2,3,4,5], 2, 2) → { data: [3,4], page: 2, totalPages: 3 }",
      },
      answer_key: {
        language_id: 93,
        hidden_tests: JS_HARNESS(`
["page 1", () => JSON.stringify(paginate([1,2,3,4,5],1,2).data)==="[1,2]"],
["page 2", () => JSON.stringify(paginate([1,2,3,4,5],2,2).data)==="[3,4]"],
["last page partial", () => JSON.stringify(paginate([1,2,3,4,5],3,2).data)==="[5]"],
["totalPages rounds up", () => paginate([1,2,3,4,5],1,2).totalPages===3],
["empty list", () => paginate([],1,10).totalPages===0 && paginate([],1,10).data.length===0],
["exact multiple", () => paginate([1,2,3,4],2,2).totalPages===2],
["beyond last page", () => paginate([1,2,3],5,2).data.length===0]`),
      },
    },
    t3: {
      title: "Implement transaction grouping",
      kind: "code_sandbox",
      rubric_id: "software_engineer.t3",
      content: {
        instructions: "Implement `groupByDay(transactions, timeZone)` that groups transactions by local calendar day (YYYY-MM-DD in the given IANA time zone), newest day first, with a total per day in kobo. Ignore transactions with status 'failed'. Add a short note explaining your approach and any edge cases. Hidden tests check correctness; your code is also reviewed for quality.",
        language: "javascript",
        starter_code: "/**\n * @param {{id:string, amount:number, status:'success'|'failed', createdAt:string}[]} transactions amounts in kobo, createdAt ISO UTC\n * @param {string} timeZone e.g. 'Africa/Lagos'\n * @returns {{day:string, total:number, items:object[]}[]}\n */\nfunction groupByDay(transactions, timeZone) {\n  // TODO\n}\n",
      },
      answer_key: {
        language_id: 93,
        hidden_tests: JS_HARNESS(`
["groups by Lagos day", () => { const r = groupByDay([{id:"a",amount:100,status:"success",createdAt:"2026-01-01T23:30:00Z"},{id:"b",amount:50,status:"success",createdAt:"2026-01-02T08:00:00Z"}],"Africa/Lagos"); return r.length===1 && r[0].day==="2026-01-02" && r[0].total===150; }],
["newest first", () => { const r = groupByDay([{id:"a",amount:1,status:"success",createdAt:"2026-01-01T10:00:00Z"},{id:"b",amount:1,status:"success",createdAt:"2026-01-03T10:00:00Z"}],"Africa/Lagos"); return r[0].day==="2026-01-03"; }],
["ignores failed", () => { const r = groupByDay([{id:"a",amount:100,status:"failed",createdAt:"2026-01-01T10:00:00Z"}],"Africa/Lagos"); return r.length===0; }],
["empty", () => Array.isArray(groupByDay([],"Africa/Lagos")) && groupByDay([],"Africa/Lagos").length===0],
["other timezone", () => { const r = groupByDay([{id:"a",amount:5,status:"success",createdAt:"2026-01-01T02:00:00Z"}],"America/New_York"); return r[0].day==="2025-12-31"; }]`),
      },
    },
    t4: AI(
      "software_engineer.t4",
      "Review this pull request as you would on a real team. List the issues you find (most serious first), explain why each matters, and suggest a fix. 200–700 words.",
      "PR #142 — \"Add wallet top-up endpoint\"\n\n```js\napp.post('/wallet/topup', async (req, res) => {\n  const { userId, amount } = req.body;\n  const user = await db.query(`SELECT * FROM users WHERE id = '${userId}'`);\n  const newBalance = user.balance + amount;\n  await db.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);\n  await paystack.charge(user.email, amount);\n  res.json({ ok: true, balance: newBalance });\n});\n```",
      { min_words: 150 },
    ),
  },
  uiux_designer: {
    t2: {
      title: "Heuristic review of a checkout screen",
      kind: "seeded_issues",
      content: {
        instructions: "Below is a description of each element on a mobile checkout screen for a food delivery app. Flag every element that has a usability problem and pick the main category of the problem. Don't flag elements that are fine.",
        categories: ["contrast", "hierarchy", "feedback", "consistency", "labels", "touch_target", "error_handling"],
        material: {
          type: "elements",
          items: [
            { id: "E1", text: "Header: 'Checkout' title, back arrow on the left (44px)." },
            { id: "E2", text: "Order summary list with item names, quantities and prices, ₦ aligned right." },
            { id: "E3", text: "Delivery address field showing placeholder text 'Address' in light grey (#C8C8C8) on white, which disappears when typing; no label above." },
            { id: "E4", text: "Promo code input next to an 'Apply' text link that is 18px tall." },
            { id: "E5", text: "Payment options as radio buttons: Card, Bank transfer, Pay on delivery. Selected option is highlighted." },
            { id: "E6", text: "Total shown in 12px grey text at the bottom left, the same size as the fine print." },
            { id: "E7", text: "Primary button 'Place order' full width, brand green with white text, 4.8:1 contrast." },
            { id: "E8", text: "After tapping 'Place order', the button does nothing visible for 6 seconds while the payment processes, then the order confirmation appears." },
            { id: "E9", text: "If the card is declined, the user is returned to the top of the screen with all fields cleared and no message." },
            { id: "E10", text: "A secondary 'Cancel' button styled exactly like the primary 'Place order' button, side by side with it." },
            { id: "E11", text: "Delivery time estimate '35–45 min' with a clock icon." },
            { id: "E12", text: "Tip selector chips (₦0, ₦200, ₦500, Custom); selected chip filled." },
          ],
        },
      },
      answer_key: {
        issues: [
          { target: "E3", category: "labels" },
          { target: "E4", category: "touch_target" },
          { target: "E6", category: "hierarchy" },
          { target: "E8", category: "feedback" },
          { target: "E9", category: "error_handling" },
          { target: "E10", category: "hierarchy" },
        ],
      },
    },
    t3: AI(
      "uiux_designer.t3",
      "Design the screen described below. Upload one image (PNG/JPG) of your design and write a short rationale (150–400 words) covering hierarchy, accessibility and the states you considered.",
      "Brief: A 'Send money' confirmation screen for a mobile wallet used by traders on low-end Android phones. Show recipient (name, bank, masked account), amount, fee, total, and a way to confirm with a 4-digit PIN. Users are nervous about sending to the wrong person.",
      { min_words: 120 },
      { allow_image: true },
    ),
    t4: AI(
      "uiux_designer.t4",
      "Map the user flow (as numbered steps, including alternate and error paths) and explain the reasoning for your key decisions. 300–800 words.",
      "Brief: A first-time user wants to join a savings group via an invite link shared on WhatsApp. They may not have the app installed and may have patchy data.",
      { min_words: 250 },
    ),
  },
  devops_engineer: {
    t2: {
      title: "Fix a broken Dockerfile",
      kind: "seeded_issues",
      content: {
        instructions: "This Dockerfile for a Node.js API builds slowly, produces a 1.2 GB image and has a security problem. Flag each problematic line and the main category of the problem. Don't flag lines that are fine.",
        categories: ["base_image", "layer_caching", "security", "correctness", "size"],
        material: {
          type: "lines",
          items: [
            { id: "L1", text: "FROM node:latest" },
            { id: "L2", text: "WORKDIR /app" },
            { id: "L3", text: "COPY . ." },
            { id: "L4", text: "RUN npm install" },
            { id: "L5", text: "ENV DATABASE_URL=postgres://admin:SuperSecret123@db.prod:5432/app" },
            { id: "L6", text: "RUN npm run build" },
            { id: "L7", text: "EXPOSE 3000" },
            { id: "L8", text: "USER root" },
            { id: "L9", text: "CMD npm start" },
          ],
        },
      },
      answer_key: {
        issues: [
          { target: "L1", category: "base_image" },
          { target: "L3", category: "layer_caching" },
          { target: "L4", category: "size" },
          { target: "L5", category: "security" },
          { target: "L8", category: "security" },
        ],
      },
    },
    t3: AI(
      "devops_engineer.t3",
      "Write a GitHub Actions workflow (YAML) for the Node.js API: install with caching, lint, run tests, build a Docker image, and push it only on main. Add a short note on your choices.",
      "Repo: Node 20, npm, `npm run lint`, `npm test`, Dockerfile at the root. Registry: GitHub Container Registry. The team wants PRs to get feedback in under 5 minutes.",
      { min_words: 60 },
    ),
    t4: AI(
      "devops_engineer.t4",
      "Write an incident response plan for the scenario (300–800 words): triage, mitigation, rollback, monitoring, communication and follow-up.",
      "Scenario: 20 minutes after a Friday 6pm deploy, payment success rate drops from 97% to 61%. Error logs show timeouts calling Paystack. The previous release ran fine for a week.",
      { min_words: 250 },
    ),
  },
  technical_writer: {
    t2: {
      title: "Edit a flawed doc",
      kind: "seeded_issues",
      content: {
        instructions: "This 'Getting started' page has errors. Flag each line with a problem and pick its main category. Don't flag lines that are fine.",
        categories: ["grammar", "accuracy", "clarity", "consistency", "missing_step"],
        material: {
          type: "lines",
          items: [
            { id: "L1", text: "# Getting started with the Kobo API" },
            { id: "L2", text: "The Kobo API let's you create savings groups and track contributions." },
            { id: "L3", text: "1. Sign up for a developer account at dashboard.kobo.ng." },
            { id: "L4", text: "2. Make a request to `GET /v1/groups` with your API key in the `Authorization` header." },
            { id: "L5", text: "3. Copy your secret key from Settings → API Keys." },
            { id: "L6", text: "Responses are returned in XML." },
            { id: "L7", text: "Use the `group_id` from the response when creating a contribution. The groupId field is required." },
            { id: "L8", text: "If authentication fails the API will return a error." },
            { id: "L9", text: "Rate limits: 100 requests per minute per key." },
            { id: "L10", text: "Utilise the endpoint in order to facilitate the leveraging of contribution data." },
          ],
        },
      },
      answer_key: {
        issues: [
          { target: "L2", category: "grammar" },
          { target: "L4", category: "missing_step" },
          { target: "L6", category: "accuracy" },
          { target: "L7", category: "consistency" },
          { target: "L8", category: "clarity" },
          { target: "L10", category: "clarity" },
        ],
      },
    },
    t3: AI(
      "technical_writer.t3",
      "Write a README for this code sample for a developer seeing it for the first time. Use Markdown.",
      "```js\n// kobo-notify: sends SMS when a contribution is received\nimport express from 'express';\nimport { sendSms } from './termii.js';\nconst app = express();\napp.use(express.json());\nconst PORT = process.env.PORT || 4000;\nconst SENDER = process.env.TERMII_SENDER_ID; // required\napp.post('/webhooks/contribution', async (req, res) => {\n  const { phone, amount, groupName } = req.body;\n  if (!phone || !amount) return res.status(400).json({ error: 'phone and amount required' });\n  await sendSms(SENDER, phone, `₦${amount / 100} received for ${groupName}`);\n  res.sendStatus(204);\n});\napp.listen(PORT);\n// termii.js reads TERMII_API_KEY from the environment\n```",
      { min_words: 150, required_sections: ["install", "usage|run", "environment|config"] },
    ),
    t4: AI(
      "technical_writer.t4",
      "Write the API reference for the endpoint described by this spec, in Markdown: description, auth, parameters, request and response examples, and errors.",
      "openapi: 3.0.0\npaths:\n  /v1/groups/{groupId}/contributions:\n    post:\n      summary: Record a contribution\n      security: [{ bearerAuth: [] }]\n      parameters:\n        - in: path\n          name: groupId\n          required: true\n          schema: { type: string }\n      requestBody:\n        content:\n          application/json:\n            schema:\n              type: object\n              required: [member_id, amount]\n              properties:\n                member_id: { type: string }\n                amount: { type: integer, description: Amount in kobo, minimum: 10000 }\n                note: { type: string, maxLength: 140 }\n      responses:\n        '201': { description: Created, content: { application/json: { schema: { type: object, properties: { id: {type: string}, status: {type: string, enum: [pending, confirmed]} } } } } }\n        '400': { description: Validation error }\n        '401': { description: Missing or invalid token }\n        '404': { description: Group or member not found }\n        '409': { description: Duplicate contribution for this cycle }",
      { min_words: 150 },
    ),
  },
  data_analyst: {
    t2: {
      title: "SQL on the orders database",
      kind: "sql_result",
      content: {
        instructions: "Write one SQL query (SQLite) that returns each city and its number of distinct customers who placed at least one 'delivered' order, sorted by that count descending, then city name ascending. Return two columns: city, customers.",
        schema: "customers(id INTEGER, name TEXT, city TEXT)\norders(id INTEGER, customer_id INTEGER, status TEXT, amount INTEGER, created_at TEXT)",
        sample: "status is one of 'delivered', 'cancelled', 'pending'",
      },
      answer_key: {
        setup_sql: "CREATE TABLE customers(id INTEGER, name TEXT, city TEXT);CREATE TABLE orders(id INTEGER, customer_id INTEGER, status TEXT, amount INTEGER, created_at TEXT);INSERT INTO customers VALUES (1,'Ada','Lagos'),(2,'Bayo','Lagos'),(3,'Chika','Abuja'),(4,'Dami','Ibadan'),(5,'Efe','Abuja'),(6,'Femi','Lagos');INSERT INTO orders VALUES (1,1,'delivered',5000,'2026-01-01'),(2,1,'delivered',3000,'2026-01-02'),(3,2,'cancelled',2000,'2026-01-02'),(4,3,'delivered',4000,'2026-01-03'),(5,4,'pending',1000,'2026-01-03'),(6,5,'delivered',2500,'2026-01-04'),(7,6,'delivered',1500,'2026-01-05'),(8,2,'delivered',900,'2026-01-06');",
        expected_rows: [["Lagos", "3"], ["Abuja", "2"]],
        ordered: true,
      },
    },
    t3: {
      title: "Clean and analyse campaign signups",
      kind: "numeric",
      content: {
        instructions: "The table has duplicates (same email twice) and test rows (emails ending @test.com). Clean it, then answer. Give numbers only; you can add notes on your method.",
        data: {
          columns: ["email", "city", "signup_day", "deposited_naira"],
          rows: [
            ["ada@mail.com", "Lagos", "Mon", "5000"], ["bayo@mail.com", "Lagos", "Mon", "0"], ["ada@mail.com", "Lagos", "Mon", "5000"],
            ["chi@mail.com", "Abuja", "Tue", "2000"], ["qa1@test.com", "Lagos", "Tue", "100000"], ["dami@mail.com", "Ibadan", "Wed", "0"],
            ["efe@mail.com", "Abuja", "Wed", "3000"], ["femi@mail.com", "Lagos", "Thu", "1000"], ["gbenga@mail.com", "Lagos", "Thu", "0"],
            ["qa2@test.com", "Abuja", "Fri", "50000"], ["hauwa@mail.com", "Abuja", "Fri", "4000"], ["chi@mail.com", "Abuja", "Tue", "2000"],
          ],
        },
        questions: [
          { id: "unique_users", prompt: "How many real, unique users are there?", unit: "users" },
          { id: "deposit_rate", prompt: "What percentage of them made a deposit (> ₦0)? (one decimal place)", unit: "%" },
          { id: "avg_deposit", prompt: "Average deposit among depositors (₦)?", unit: "₦" },
          { id: "abuja_total", prompt: "Total deposited by Abuja users (₦)?", unit: "₦" },
        ],
      },
      answer_key: {
        answers: {
          unique_users: { value: 8, tolerance: 0, explanation: "12 rows − 2 duplicates − 2 test rows = 8 unique real users." },
          deposit_rate: { value: 62.5, tolerance: 0.1 },
          avg_deposit: { value: 3000, tolerance: 1 },
          abuja_total: { value: 9000, tolerance: 1 },
        },
      },
    },
    t4: AI(
      "data_analyst.t4",
      "Write an insight memo (300–700 words) for the head of growth: lead with your main finding, back it with numbers from the data, give 2–3 prioritised recommendations, and note caveats.",
      "Weekly funnel for a savings app (last 4 weeks):\nWeek | Installs | Signups | KYC done | First deposit | Channel mix (installs)\nW1 | 4,000 | 2,800 | 1,900 | 760 | 60% Facebook, 40% referral\nW2 | 5,200 | 3,500 | 2,000 | 700 | 75% Facebook, 25% referral\nW3 | 6,100 | 4,000 | 2,050 | 690 | 82% Facebook, 18% referral\nW4 | 4,300 | 3,000 | 2,100 | 880 | 55% Facebook, 45% referral\nReferral users deposit at ~2.1× the rate of Facebook users. KYC requires BVN; a BVN outage happened on W2 Tue–Thu.",
      { min_words: 250 },
    ),
  },
  qa_engineer: {
    t2: {
      title: "Find the bugs in the transfer app",
      kind: "seeded_issues",
      content: {
        instructions: "We ran a build of a money transfer app and recorded what happened in each scenario. Flag every scenario that shows a bug and pick its category. Expected behaviour is in brackets where it isn't obvious.",
        categories: ["functional", "validation", "ui", "security", "performance"],
        material: {
          type: "elements",
          items: [
            { id: "B1", text: "Transfer ₦5,000 to a saved recipient → succeeds, balance decreases by ₦5,000 + ₦10 fee." },
            { id: "B2", text: "Enter amount '-500' → transfer goes through and balance increases by ₦500." },
            { id: "B3", text: "Enter amount larger than balance → 'Insufficient funds' shown." },
            { id: "B4", text: "Account number field accepts letters and submits them to the bank lookup." },
            { id: "B5", text: "Transaction history loads 50 items in under 1 second." },
            { id: "B6", text: "Changing the URL from /transfers/123 to /transfers/124 shows another user's transfer receipt." },
            { id: "B7", text: "On a 360px-wide screen, the 'Confirm' button is pushed off-screen and can't be reached." },
            { id: "B8", text: "Wrong PIN entered 3 times → account locked for 30 minutes (as designed)." },
            { id: "B9", text: "Tapping 'Send' twice quickly sends the money twice." },
            { id: "B10", text: "Searching history for 'Ada' returns transfers to Ada and Adaeze." },
            { id: "B11", text: "Receipt PDF takes 45 seconds to generate (expected under 3s)." },
          ],
        },
      },
      answer_key: {
        issues: [
          { target: "B2", category: "validation" },
          { target: "B4", category: "validation" },
          { target: "B6", category: "security" },
          { target: "B7", category: "ui" },
          { target: "B9", category: "functional" },
          { target: "B11", category: "performance" },
        ],
      },
    },
    t3: AI(
      "qa_engineer.t3",
      "Write test cases for this spec. For each: ID, title, preconditions, steps, expected result, and priority. Cover positive, negative and edge cases.",
      "Spec — Group savings payout:\n• A group has 2–10 members and a fixed contribution (₦1,000–₦100,000) per cycle.\n• Each cycle, one member receives the pot (contribution × members) in the payout order set at creation.\n• Payout happens automatically at 9am WAT on the cycle date only if every member has contributed; otherwise it's delayed by 24h and members who haven't paid get an SMS.\n• A member can't leave a group mid-cycle.\n• Admins can reorder payout only before the first cycle starts.",
      { min_words: 200 },
    ),
    t4: {
      title: "Write automated tests",
      kind: "code_sandbox",
      rubric_id: "qa_engineer.t4",
      content: {
        instructions: "Write a function `runTests(isValidPhone)` that throws an Error if `isValidPhone` behaves incorrectly. We'll run your tests against the correct implementation (they must pass) and against several buggy versions (they should fail). Spec: valid Nigerian mobile numbers are either 11 digits starting with 070, 080, 081, 090 or 091, or +234 followed by 10 digits starting with 70, 80, 81, 90 or 91. Spaces are not allowed.",
        language: "javascript",
        starter_code: "function assert(cond, msg) { if (!cond) throw new Error(msg); }\n\nfunction runTests(isValidPhone) {\n  assert(isValidPhone('08012345678') === true, 'basic 080 number');\n  // add more tests\n}\n",
      },
      answer_key: {
        language_id: 93,
        hidden_tests: `
;(function(){
const PREFIX=['70','80','81','90','91'];
const correct=(s)=>{ if(typeof s!=='string') return false; let m=s.match(/^0(\\d{10})$/)||s.match(/^\\+234(\\d{10})$/); return !!m && PREFIX.includes(m[1].slice(0,2)); };
const mutants=[
 (s)=>/^0\\d{10}$/.test(s)||/^\\+234\\d{10}$/.test(s),
 (s)=>{ let m=s.match(/^0(\\d{9,10})$/)||s.match(/^\\+234(\\d{10})$/); return !!m && PREFIX.includes(m[1].slice(0,2)); },
 (s)=>{ let m=s.match(/^0(\\d{10})$/); return !!m && PREFIX.includes(m[1].slice(0,2)); },
 (s)=>{ let m=s.replace(/ /g,'').match(/^0(\\d{10})$/)||s.replace(/ /g,'').match(/^\\+234(\\d{10})$/); return !!m && PREFIX.includes(m[1].slice(0,2)); },
 (s)=>{ let m=s.match(/^0(\\d{10})$/)||s.match(/^\\+234(\\d{10})$/); return !!m && ['70','80','81','90'].includes(m[1].slice(0,2)); },
];
let passed=0; const failures=[]; let total=mutants.length+1;
try { runTests(correct); passed++; } catch(e){ failures.push('Your tests fail on the correct implementation: '+e.message); }
mutants.forEach((m,i)=>{ try { runTests(m); failures.push('Mutant '+(i+1)+' survived'); } catch(e){ passed++; } });
console.log(JSON.stringify({passed,total,failures}));
})();`,
      },
    },
  },
  growth_marketer: {
    t2: {
      title: "Analyse campaign data",
      kind: "numeric",
      content: {
        instructions: "Here are last month's results for three campaigns promoting a savings app. Answer each question with a number.",
        data: {
          columns: ["campaign", "spend_naira", "impressions", "clicks", "signups", "first_deposits", "revenue_naira"],
          rows: [
            ["Facebook Lagos", "300000", "600000", "9000", "1200", "240", "720000"],
            ["Instagram Abuja", "150000", "250000", "5000", "500", "150", "450000"],
            ["Referral program", "100000", "—", "—", "400", "200", "600000"],
          ],
        },
        questions: [
          { id: "fb_ctr", prompt: "Facebook Lagos CTR (%)", unit: "%" },
          { id: "ig_cps", prompt: "Instagram Abuja cost per signup (₦)", unit: "₦" },
          { id: "ref_cpd", prompt: "Referral cost per first deposit (₦)", unit: "₦" },
          { id: "best_roas", prompt: "Highest ROAS of the three (revenue ÷ spend)", unit: "x" },
        ],
      },
      answer_key: {
        answers: {
          fb_ctr: { value: 1.5, tolerance: 0.05 },
          ig_cps: { value: 300, tolerance: 1 },
          ref_cpd: { value: 500, tolerance: 1 },
          best_roas: { value: 6, tolerance: 0.05 },
        },
      },
    },
    t3: AI(
      "growth_marketer.t3",
      "Write landing page copy (250–600 words): headline, subheadline, 3 benefit sections, social proof placeholder (don't invent real numbers), how it works, FAQ (3 questions), and CTAs.",
      "Product: Kobo Group Savings — save with people you trust, like a digital ajo, with automatic payouts and SMS receipts. Audience: market traders aged 25–45 in Lagos and Ibadan who already use ajo collectors but worry about collectors disappearing with money.",
      { min_words: 200 },
    ),
    t4: AI(
      "growth_marketer.t4",
      "Write a go-to-market mini plan (400–800 words): initial segment, positioning, channels and sequence, budget split for ₦1,000,000 over 6 weeks, metrics and targets, and risks.",
      "Launch: Kobo Group Savings in Ibadan (first city outside Lagos). Lagos learnings: referral users deposit 2× more; WhatsApp groups drove 40% of signups; Facebook CPA rose 35% in the last month.",
      { min_words: 300 },
    ),
  },
};
