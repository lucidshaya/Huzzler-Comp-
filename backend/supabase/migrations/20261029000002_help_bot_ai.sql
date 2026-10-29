-- The help bot answers with AI (grounded in the FAQ and the platform guide), not FAQ matching alone.
update feature_flags set enabled = true, value = '{"ai": true}' where key = 'help_bot';
