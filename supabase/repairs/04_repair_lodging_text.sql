-- Repairs AUDIT-005 and AUDIT-007.
--
-- 005: the Housing tab used to append the camping text twice
--   ("...; Camping: Tent: 2, RV: 1; Tent: 2, RV: 1"). The repeated last
--   segment is removed only when it exactly equals the camping detail.
-- 007: bookings saved in the Housing tab before this fix still carry the
--   imported label in room_name. Per Q-024 the Housing tab is the record:
--   room_name becomes the Housing text (or "Unassigned"), and the old label
--   is kept as rentalFormDetails.importedLodgingText if none is stored.
--
-- Lodging text that lost room or camping detail after a Create Booking edit
-- is NOT rebuilt here (review list in 01_diagnostics.sql); opening and
-- saving the booking's Housing tab regenerates it. Undo:
--   select public.audit_repair_rollback('005-camping-duplicate');
--   select public.audit_repair_rollback('007-room-name');

begin;

-- 005
insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '005-camping-duplicate', 'bookings', id, 'buildings_rooms', to_jsonb(buildings_rooms),
       to_jsonb(regexp_replace(buildings_rooms, ';\s*([^;]+)$', ''))
from public.bookings
where buildings_rooms ~ 'Camping: ([^;]+);\s*\1\s*$';

select public.audit_repair_apply('005-camping-duplicate') as camping_rows_changed;

-- 007: keep the old label as the reference note first, then replace it.
insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '007-room-name', 'bookings', id, 'raw_data', raw_data,
       jsonb_set(raw_data, '{rentalFormDetails,importedLodgingText}', to_jsonb(room_name))
from public.bookings
where jsonb_typeof(raw_data->'rentalFormDetails'->'housingUsage') = 'object'
  and coalesce(nullif(trim(room_name), ''), 'Unassigned') <> 'Unassigned'
  and room_name is distinct from buildings_rooms
  and coalesce(raw_data->'rentalFormDetails'->>'importedLodgingText', '') = '';

insert into public.audit_repair_log (repair, table_name, row_id, column_name, old_value, new_value)
select '007-room-name', 'bookings', id, 'room_name', to_jsonb(room_name),
       to_jsonb(coalesce(nullif(trim(buildings_rooms), ''), 'Unassigned'))
from public.bookings
where jsonb_typeof(raw_data->'rentalFormDetails'->'housingUsage') = 'object'
  and coalesce(nullif(trim(room_name), ''), 'Unassigned') <> 'Unassigned'
  and room_name is distinct from buildings_rooms;

select public.audit_repair_apply('007-room-name') as room_name_values_changed;

select count(*) as camping_duplicates_remaining from public.bookings
where buildings_rooms ~ 'Camping: ([^;]+);\s*\1\s*$';

commit;
