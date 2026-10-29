-- Monthly AI cap raised from $3.50 to $20.
update feature_flags set value = '{"amount": 20}', enabled = true where key = 'monthly_ai_budget_usd';
