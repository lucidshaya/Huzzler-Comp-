-- Catalogue data that the app cannot run without. Content (tests, projects, personas) is
-- seeded separately by `npm run seed` so it can go through the admin approval flow.

insert into roles (id, name, description, team_duty, sort_order) values
  ('software_engineer','Software Engineer','Builds and ships product features.','Builds and fixes product features',1),
  ('product_manager','Product Manager','Owns scope, priorities and the team rhythm.','Sets scope, writes PRDs, prioritises the backlog, runs standups',2),
  ('uiux_designer','UI/UX Designer','Designs screens, flows and design system pieces.','Designs screens, flows and design system pieces',3),
  ('devops_engineer','DevOps Engineer','Keeps the product building, deploying and observable.','CI/CD, containers, deployment, monitoring',4),
  ('technical_writer','Technical Writer','Makes the product understandable.','READMEs, API docs, user guides, release notes',5),
  ('data_analyst','Data Analyst','Turns product data into decisions.','Metrics, SQL, dashboards, insight memos',6),
  ('qa_engineer','QA / Test Engineer','Finds what breaks before users do.','Test plans, bug reports, automated tests',7),
  ('growth_marketer','Digital / Growth Marketer','Gets the product in front of the right people.','Positioning, launch copy, go-to-market, campaign analysis',8);

insert into archetypes (id, name, description) values
  ('web3_fintech','Web3 / Fintech','Payments, wallets, lending and on-chain products.'),
  ('saas_mobile','SaaS / Mobile','Subscription web apps and mobile-first products.'),
  ('data_driven','Data-Driven','Analytics products, dashboards and data pipelines.'),
  ('infrastructure','Infrastructure','Developer tooling, platforms and internal infrastructure.');

insert into role_archetype_compatibility (role_id, archetype_id) values
  ('software_engineer','web3_fintech'),('software_engineer','saas_mobile'),('software_engineer','data_driven'),('software_engineer','infrastructure'),
  ('product_manager','web3_fintech'),('product_manager','saas_mobile'),('product_manager','data_driven'),('product_manager','infrastructure'),
  ('technical_writer','web3_fintech'),('technical_writer','saas_mobile'),('technical_writer','data_driven'),('technical_writer','infrastructure'),
  ('uiux_designer','web3_fintech'),('uiux_designer','saas_mobile'),('uiux_designer','data_driven'),
  ('devops_engineer','web3_fintech'),('devops_engineer','saas_mobile'),('devops_engineer','infrastructure'),
  ('qa_engineer','web3_fintech'),('qa_engineer','saas_mobile'),('qa_engineer','infrastructure'),
  ('data_analyst','web3_fintech'),('data_analyst','data_driven'),
  ('growth_marketer','web3_fintech'),('growth_marketer','saas_mobile');

insert into squad_templates (archetype_id, template) values
  ('saas_mobile', '{"required":{"product_manager":1,"software_engineer":2,"uiux_designer":1,"qa_engineer":1},"optional":["devops_engineer","technical_writer","growth_marketer"],"max_size":7}'),
  ('web3_fintech', '{"required":{"product_manager":1,"software_engineer":2,"uiux_designer":1},"optional":["qa_engineer","devops_engineer","data_analyst","technical_writer","growth_marketer"],"max_size":7}'),
  ('data_driven', '{"required":{"product_manager":1,"data_analyst":2,"software_engineer":1},"optional":["uiux_designer","technical_writer"],"max_size":7}'),
  ('infrastructure', '{"required":{"product_manager":1,"software_engineer":2,"devops_engineer":1},"optional":["qa_engineer","technical_writer"],"max_size":7}');

insert into plans (id, name, amount_kobo, interval, access_days) values
  ('one_time','One-time',500000,null,180),
  ('monthly','Monthly',250000,'monthly',null);

insert into feature_flags (key, enabled, value) values
  ('ai_grading', true, null),
  ('mentor_chat', true, '{"daily_limit":10,"faq_threshold":0.85}'),
  ('monthly_ai_budget_usd', true, '{"amount":500}'),
  ('opportunities', true, null);

-- Storage buckets (private; the API hands out signed URLs)
insert into storage.buckets (id, name, public) values
  ('submissions','submissions',false),
  ('avatars','avatars',false),
  ('certificates','certificates',false)
on conflict (id) do nothing;
