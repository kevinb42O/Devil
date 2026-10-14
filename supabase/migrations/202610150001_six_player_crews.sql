begin;
alter table public.abyss_crew_members drop constraint abyss_crew_members_slot_check;
alter table public.abyss_crew_members add constraint abyss_crew_members_slot_check check(slot between 0 and 5);
alter table public.abyss_crew_bests drop constraint abyss_crew_bests_party_size_check;
alter table public.abyss_crew_bests add constraint abyss_crew_bests_party_size_check check(party_size between 2 and 6);

create or replace function abyss_private.valid_crew_roster(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare member jsonb; ids text[]:=array[]::text[]; hosts integer:=0;
begin
 if p is null or jsonb_typeof(p)<>'array' or jsonb_array_length(p) not between 1 and 6 then return false;end if;
 for member in select value from jsonb_array_elements(p) loop
  if jsonb_typeof(member)<>'object' or coalesce(member->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$'
   or coalesce(char_length(btrim(member->>'name')),0) not between 1 and 24 or (member->>'name') ~ '[[:cntrl:]]'
   or jsonb_typeof(member->'host') is distinct from 'boolean' or member->>'id'=any(ids)
   or (select count(*) from jsonb_object_keys(member))<>3 then return false;end if;
  ids:=array_append(ids,member->>'id');if (member->>'host')::boolean then hosts:=hosts+1;end if;
 end loop;return hosts=1;
end;$$;

commit;
