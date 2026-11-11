-- Business Review experiment (one question per screen): allow a 'form_step' analytics event,
-- sent each time a question screen is shown, with a label like '3/5 context'. No personal data.
-- NOT APPLIED YET. Until it is, those events are rejected by the check constraint and simply dropped;
-- the form itself is unaffected.
alter table public.analytics_events drop constraint if exists analytics_events_event_check;
alter table public.analytics_events add constraint analytics_events_event_check
  check (event in ('pageview', 'cta_click', 'form_start', 'form_step', 'form_submit', 'selfcheck_tick', 'case_open', 'demo_play'));
