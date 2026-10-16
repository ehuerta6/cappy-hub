-- Let active presenters edit only their own slot details; Event managers retain scoped access.
create or replace function private.update_presenter_slot_details(
  p_slot_id bigint,
  p_title text,
  p_url text,
  p_difficulty text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id bigint := private.current_active_officer_id();
  current_event public.events;
  slot public.presentation_slots;
  new_title text := nullif(pg_catalog.btrim(p_title), '');
  new_url text := nullif(pg_catalog.btrim(p_url), '');
  new_notes text := nullif(pg_catalog.btrim(p_notes), '');
begin
  if actor_id is null then raise exception 'Unauthorized'; end if;

  select * into slot
  from public.presentation_slots
  where id = p_slot_id;
  if not found then raise exception 'Presenter slot not found'; end if;

  select * into current_event
  from public.events
  where id = slot.event_id
  for update;

  select * into slot
  from public.presentation_slots
  where id = p_slot_id
  for update;
  if not found then raise exception 'Presenter slot not found'; end if;

  if not private.is_session_event_type(current_event.event_type_id) then
    raise exception 'Presenter slots are only allowed for Session Events';
  end if;
  if not private.presenter_slots_open(current_event) then
    raise exception 'Presenter slots are closed for this event';
  end if;
  if not exists (
    select 1 from public.officers
    where id = actor_id and status = 'active'
  ) then
    raise exception 'Unauthorized';
  end if;
  if slot.officer_id is distinct from actor_id
    and not private.can_manage_event(slot.event_id) then
    raise exception 'Cannot manage another officer presenter slot for this event';
  end if;

  if new_url is not null and new_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Resource link must be an HTTP(S) URL';
  end if;
  if length(new_title) > 200 or length(new_notes) > 2000 or length(p_difficulty) > 100 then
    raise exception 'Presenter slot details are too long';
  end if;

  if (new_title, new_url, p_difficulty, new_notes) is distinct from
    (slot.presentation_title, slot.resource_url, slot.difficulty, slot.prep_notes) then
    update public.presentation_slots
    set presentation_title = new_title,
        resource_url = new_url,
        difficulty = p_difficulty,
        prep_notes = new_notes
    where id = p_slot_id;

    perform private.write_audit_log(
      'presentation.details_updated',
      'event',
      slot.event_id::text,
      pg_catalog.jsonb_build_object(
        'slot_id', slot.id,
        'position', slot.position,
        'before', pg_catalog.jsonb_build_object(
          'presentation_title', slot.presentation_title,
          'resource_url', slot.resource_url,
          'difficulty', slot.difficulty,
          'prep_notes', slot.prep_notes
        ),
        'after', pg_catalog.jsonb_build_object(
          'presentation_title', new_title,
          'resource_url', new_url,
          'difficulty', p_difficulty,
          'prep_notes', new_notes
        )
      )
    );
  end if;
end;
$$;
