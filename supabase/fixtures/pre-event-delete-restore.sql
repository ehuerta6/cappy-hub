-- Legacy combinations that must retain their meaning when Event Delete lands.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000009331','event-delete-upgrade@example.test');
insert into public.events(id,name,description,location,event_type_id,event_date,starts_at,ends_at,status,
  deleted_at,deleted_by,participation_points_per_hour_at_end)
values
 (93301,'Legacy archived cancelled Event','Preserve legacy archive and cancellation','TBA',
  (select id from public.event_types where name='Meeting'),'2020-09-01','2020-09-01 09:00-06',
  '2020-09-01 10:00-06','cancelled','2020-09-02 00:00:00+00',
  '00000000-0000-4000-8000-000000009331',7),
 (93302,'Legacy cancelled Event','Preserve legacy cancellation','TBA',
  (select id from public.event_types where name='Meeting'),'2020-09-02','2020-09-02 09:00-06',
  '2020-09-02 10:00-06','cancelled',null,null,5);
insert into public.point_transactions(id,officer_id,event_id,points,reason,award_type,removed_at,removed_by)
values
 (93301,90003,93301,3,'Legacy archived Event manual credit','manual',null,null),
 (93302,90003,93301,2,'Legacy archived Event removed credit','participation',
  '2020-09-03 00:00:00+00','00000000-0000-4000-8000-000000009331'),
 (93303,90003,93302,4,'Legacy cancelled Event manual credit','manual',null,null);
