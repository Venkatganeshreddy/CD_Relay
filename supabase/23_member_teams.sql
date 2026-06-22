-- Set dept/sub/level for content members as they are assigned.
-- Chanakya Meesala + Yerramilli Phani Yeshwanth — Fullstack, L2.
update employees set
  role_level = 'L2', dept = 'd-fsgci', sub = 'Content — Fullstack',
  title = 'L2 · Content — Fullstack',
  data = data || jsonb_build_object('role','L2','level','L2','dept','d-fsgci',
                                    'sub','Content — Fullstack','title','L2 · Content — Fullstack')
where id in ('NW0001771','NW0006025');
