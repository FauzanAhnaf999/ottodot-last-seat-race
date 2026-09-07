-- Run after schema.sql
-- Synthetic seed matching InMemoryStore

insert into parents (id, name, email) values
  ('par_1','Siti Rahayu','siti@example.com'),
  ('par_2','Budi Santoso','budi@example.com'),
  ('par_3','Anya Lee','anya@example.com'),
  ('par_4','James Carter','james@example.com')
on conflict (id) do nothing;

insert into students (id, parent_id, name, age) values
  ('stu_1','par_1','Kiko Rahayu',9),
  ('stu_2','par_1','Milo Rahayu',7),
  ('stu_3','par_2','Dina Santoso',10),
  ('stu_4','par_3','Ella Lee',8),
  ('stu_5','par_4','Noah Carter',9),
  ('stu_6','par_2','Riko Santoso',8),
  ('stu_7','par_3','Sam Lee',11)
on conflict (id) do nothing;

insert into trial_classes (id, title, subject, starts_at, capacity, teacher_name) values
  ('cls_available','Science Explorers — Trial','Science', now() + interval '2 days', 4, 'Ms. Putri'),
  ('cls_almost_full','Math Masters — Trial','Math', now() + interval '3 days', 4, 'Mr. Adi'),
  ('cls_full','Robotics Intro — Trial','Science', now() + interval '1 day', 4, 'Mr. Ken'),
  ('cls_race','Space Lab — Trial (Race Test)','Science', now() + interval '4 days', 4, 'Dr. Nova')
on conflict (id) do nothing;

-- 3 confirmed in almost_full (1 seat left)
insert into bookings (id, student_id, trial_class_id, parent_id, status) values
  ('bk_1','stu_3','cls_almost_full','par_2','confirmed'),
  ('bk_2','stu_4','cls_almost_full','par_3','confirmed'),
  ('bk_3','stu_5','cls_almost_full','par_4','confirmed'),
  ('bk_4','stu_1','cls_full','par_1','confirmed'),
  ('bk_5','stu_2','cls_full','par_1','confirmed'),
  ('bk_6','stu_3','cls_full','par_2','confirmed'),
  ('bk_7','stu_4','cls_full','par_3','confirmed'),
  ('bk_8','stu_1','cls_race','par_1','confirmed'),
  ('bk_9','stu_2','cls_race','par_1','confirmed'),
  ('bk_10','stu_3','cls_race','par_2','confirmed'),
  ('bk_dup_pending','stu_1','cls_available','par_1','pending_payment'),
  ('bk_failed','stu_6','cls_available','par_2','payment_failed')
on conflict (id) do nothing;

insert into payment_attempts (id, booking_id, status, amount_cents, provider_ref) values
  ('pay_failed_1','bk_failed','failed',50000,'mock_fail_001')
on conflict (id) do nothing;
