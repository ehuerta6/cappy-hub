insert into public.events(
  id,name,description,location,event_type_id,event_date,starts_at,ends_at,status
) values
  (-29290,'Calendar backfill global Meeting','Synthetic migration fixture','Campus',
    (select id from public.event_types where name='Meeting'),'2099-10-01',
    '2099-10-01 10:00-06','2099-10-01 11:00-06','upcoming'),
  (-29289,'Calendar backfill branched Workshop','Synthetic migration fixture','Campus',
    (select id from public.event_types where name='Workshop'),'2099-10-02',
    '2099-10-02 10:00-06','2099-10-02 11:00-06','upcoming'),
  (-29288,'Calendar backfill past Event','Synthetic migration fixture','Campus',
    (select id from public.event_types where name='Social'),'2000-10-01',
    '2000-10-01 10:00-06','2000-10-01 11:00-06','past');

insert into public.event_branches(event_id,branch_id)
select -29289,id from public.branches where name='intro';
