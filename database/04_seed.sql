-- ============================================================================
--  SOLO LEVELING SYSTEM  ·  04_seed.sql
--  Reference data: workout modalities + strength exercise library.
--  MET values follow the 2011 Compendium of Physical Activities.
--  `fields` drives the dynamic logging form on the client — add a modality
--  here and the UI picks it up with no code change.
-- ============================================================================

-- Upsert (not truncate) so re-running never destroys logged sessions.
insert into public.workout_types
  (code, name, category, icon, met_base, met_low, met_high, primary_stat, popularity, blurb, fields) values

('WEIGHT_TRAINING','Weight Training','STRENGTH','dumbbell',5.0,3.0,6.5,'STR',100,
 'Progressive overload against external resistance.',
 '[{"key":"split","label":"Split","type":"select","options":["Push","Pull","Legs","Upper","Lower","Full Body","Chest","Back","Shoulders","Arms","Custom"],"required":true},
   {"key":"exercises","label":"Exercises","type":"sets"}]'),

('RUNNING','Running','ENDURANCE','footprints',9.8,7.0,14.5,'AGI',99,
 'The most accessible entry point into fitness.',
 '[{"key":"distance_km","label":"Distance","type":"number","unit":"km","step":0.1,"min":0,"max":200,"required":true},
   {"key":"avg_pace","label":"Avg pace","type":"text","unit":"min/km","placeholder":"5:30"},
   {"key":"elevation_m","label":"Elevation gain","type":"number","unit":"m","step":1,"min":0},
   {"key":"avg_hr","label":"Avg heart rate","type":"number","unit":"bpm","min":40,"max":220},
   {"key":"terrain","label":"Terrain","type":"select","options":["Road","Trail","Treadmill","Track"]}]'),

('WALKING','Walking','ENDURANCE','footprints',3.5,2.5,5.0,'VIT',95,
 'Low cost, high adherence. Counts more than people think.',
 '[{"key":"steps","label":"Steps","type":"number","step":100,"min":0,"max":100000},
   {"key":"distance_km","label":"Distance","type":"number","unit":"km","step":0.1,"min":0},
   {"key":"style","label":"Style","type":"select","options":["Steady","Brisk","Interval (Japanese)","Incline","Rucking"]},
   {"key":"load_kg","label":"Pack weight","type":"number","unit":"kg","step":0.5,"min":0}]'),

('CYCLING','Cycling','ENDURANCE','bike',7.5,4.0,12.0,'AGI',92,
 'High volume aerobic work with low joint cost.',
 '[{"key":"distance_km","label":"Distance","type":"number","unit":"km","step":0.1,"required":true},
   {"key":"avg_speed","label":"Avg speed","type":"number","unit":"km/h","step":0.1},
   {"key":"elevation_m","label":"Elevation gain","type":"number","unit":"m","step":1},
   {"key":"avg_power","label":"Avg power","type":"number","unit":"W","min":0},
   {"key":"surface","label":"Type","type":"select","options":["Road","MTB","Indoor Trainer","Spin Class","Commute"]}]'),

('SWIMMING','Swimming','ENDURANCE','waves',7.0,4.5,10.0,'AGI',88,
 'Full-body conditioning with near-zero impact.',
 '[{"key":"distance_m","label":"Distance","type":"number","unit":"m","step":25,"required":true},
   {"key":"laps","label":"Laps","type":"number","step":1},
   {"key":"stroke","label":"Main stroke","type":"select","options":["Freestyle","Breaststroke","Backstroke","Butterfly","Mixed"]},
   {"key":"pool_length","label":"Pool length","type":"select","options":["25 m","50 m","Open water"]}]'),

('HIIT','HIIT','MIXED','zap',8.0,6.0,12.0,'AGI',90,
 'Short maximal bursts against short recovery.',
 '[{"key":"rounds","label":"Rounds","type":"number","step":1,"min":1,"required":true},
   {"key":"work_sec","label":"Work","type":"number","unit":"sec","step":5},
   {"key":"rest_sec","label":"Rest","type":"number","unit":"sec","step":5},
   {"key":"protocol","label":"Protocol","type":"select","options":["Tabata","EMOM","AMRAP","30-20-10","Circuit","Custom"]},
   {"key":"movements","label":"Movements","type":"text","placeholder":"Burpees, KB swings, box jumps"}]'),

('PILATES','Pilates','MIND_BODY','activity',3.0,2.5,4.5,'VIT',89,
 'Spinal control, hip stability, movement quality.',
 '[{"key":"style","label":"Style","type":"select","options":["Mat","Reformer","Tower","Chair","Hot"],"required":true},
   {"key":"level","label":"Level","type":"select","options":["Beginner","Intermediate","Advanced"]},
   {"key":"focus","label":"Focus","type":"text","placeholder":"Core, posterior chain"}]'),

('YOGA','Yoga','MIND_BODY','flower',3.0,2.0,5.0,'VIT',94,
 'Mobility, breath control, and nervous-system downshift.',
 '[{"key":"style","label":"Style","type":"select","options":["Hatha","Vinyasa","Ashtanga","Power","Yin","Bikram / Hot","Restorative","Walking Yoga"],"required":true},
   {"key":"poses","label":"Key poses","type":"text"},
   {"key":"breathwork_min","label":"Breathwork","type":"number","unit":"min","step":1}]'),

('CALISTHENICS','Calisthenics','STRENGTH','user',5.5,3.5,8.0,'STR',82,
 'Bodyweight mastery. Strength that travels with you.',
 '[{"key":"exercises","label":"Exercises","type":"sets"},
   {"key":"skill_work","label":"Skill practice","type":"text","placeholder":"Muscle-up, handstand, front lever"}]'),

('FUNCTIONAL','Functional / CrossFit','MIXED','flame',7.5,5.0,11.0,'STR',85,
 'Constantly varied, compound, high intensity.',
 '[{"key":"wod","label":"WOD name","type":"text","placeholder":"Fran, Murph, Cindy"},
   {"key":"format","label":"Format","type":"select","options":["For Time","AMRAP","EMOM","Chipper","Strength + Metcon"]},
   {"key":"result","label":"Score / time","type":"text","placeholder":"14:32 or 8 rounds + 12"},
   {"key":"rx","label":"Prescribed weight","type":"select","options":["Rx","Scaled"]}]'),

('HYROX','HYROX / Hybrid Race','MIXED','trophy',9.5,7.0,13.0,'WIL',78,
 'Eight running legs, eight functional stations. Nowhere to hide.',
 '[{"key":"stations","label":"Stations completed","type":"number","step":1,"min":0,"max":8},
   {"key":"run_km","label":"Total running","type":"number","unit":"km","step":0.1},
   {"key":"finish_time","label":"Total time","type":"text","placeholder":"1:12:40"},
   {"key":"division","label":"Division","type":"select","options":["Open","Pro","Doubles","Relay","Training"]}]'),

('ROWING','Rowing','ENDURANCE','rows',7.0,4.5,10.0,'AGI',72,
 'Posterior-chain-dominant aerobic power.',
 '[{"key":"distance_m","label":"Distance","type":"number","unit":"m","step":100,"required":true},
   {"key":"split_500","label":"Avg split /500 m","type":"text","placeholder":"2:05"},
   {"key":"stroke_rate","label":"Stroke rate","type":"number","unit":"spm","step":1},
   {"key":"avg_watts","label":"Avg power","type":"number","unit":"W"}]'),

('JUMP_ROPE','Jump Rope','ENDURANCE','circle-dot',11.0,8.0,12.5,'AGI',70,
 'Highest calorie burn per square metre of floor.',
 '[{"key":"skips","label":"Total skips","type":"number","step":10},
   {"key":"rounds","label":"Rounds","type":"number","step":1},
   {"key":"style","label":"Style","type":"select","options":["Basic bounce","Alternate foot","Double unders","Criss-cross","Freestyle"]}]'),

('BOXING','Boxing','MIXED','swords',7.0,5.0,10.0,'AGI',80,
 'Conditioning, coordination, and a valve for pressure.',
 '[{"key":"rounds","label":"Rounds","type":"number","step":1,"required":true},
   {"key":"round_min","label":"Round length","type":"number","unit":"min","step":0.5},
   {"key":"work","label":"Work type","type":"select","options":["Heavy bag","Pads","Shadow","Sparring","Skipping + drills"]}]'),

('MARTIAL_ARTS','Martial Arts','SPORT','shield',7.5,5.0,10.5,'WIL',75,
 'Technical skill under live resistance.',
 '[{"key":"discipline","label":"Discipline","type":"select","options":["BJJ","Muay Thai","Judo","Karate","Taekwondo","MMA","Wrestling","Kickboxing"],"required":true},
   {"key":"rolls","label":"Rounds / rolls","type":"number","step":1},
   {"key":"technique","label":"Technique focus","type":"text"}]'),

('HIKING','Hiking','ENDURANCE','mountain',6.0,3.5,9.0,'VIT',77,
 'Long aerobic effort with real terrain cost.',
 '[{"key":"distance_km","label":"Distance","type":"number","unit":"km","step":0.1,"required":true},
   {"key":"elevation_m","label":"Elevation gain","type":"number","unit":"m","step":10},
   {"key":"pack_kg","label":"Pack weight","type":"number","unit":"kg","step":0.5},
   {"key":"trail","label":"Trail","type":"text"}]'),

('DANCE','Dance','MIXED','music',5.0,3.0,7.5,'AGI',73,
 'Cardio that does not feel like cardio.',
 '[{"key":"style","label":"Style","type":"select","options":["Zumba","Hip Hop","Bharatanatyam","Salsa","Contemporary","Bollywood","Ballet","Freestyle"],"required":true},
   {"key":"class_type","label":"Setting","type":"select","options":["Class","Solo practice","Performance"]}]'),

('STAIR_CLIMB','Stair Climbing','ENDURANCE','trending-up',8.8,6.0,11.0,'AGI',60,
 'Brutal aerobic return for very little time.',
 '[{"key":"floors","label":"Floors","type":"number","step":1,"required":true},
   {"key":"machine","label":"Mode","type":"select","options":["Stairmaster","Real stairs","Stadium"]}]'),

('ELLIPTICAL','Elliptical','ENDURANCE','orbit',5.0,3.5,7.5,'AGI',58,
 'Low-impact steady state for recovery weeks.',
 '[{"key":"distance_km","label":"Distance","type":"number","unit":"km","step":0.1},
   {"key":"resistance","label":"Resistance","type":"number","step":1,"min":1,"max":20},
   {"key":"incline","label":"Incline","type":"number","step":1,"min":0,"max":20}]'),

('CLIMBING','Rock Climbing','SPORT','mountain-snow',8.0,5.0,11.0,'STR',64,
 'Grip, tension, and problem solving under fatigue.',
 '[{"key":"discipline","label":"Discipline","type":"select","options":["Bouldering","Top rope","Lead","Outdoor sport","Trad"],"required":true},
   {"key":"hardest_grade","label":"Hardest grade sent","type":"text","placeholder":"V4 / 6b+"},
   {"key":"routes","label":"Routes / problems","type":"number","step":1}]'),

('FOOTBALL','Football','SPORT','circle',8.0,5.0,11.0,'AGI',86,
 'Repeated sprints, changes of direction, decisions at pace.',
 '[{"key":"format","label":"Format","type":"select","options":["5-a-side","7-a-side","11-a-side","Training"],"required":true},
   {"key":"position","label":"Position","type":"text"},
   {"key":"goals","label":"Goals","type":"number","step":1,"min":0}]'),

('BADMINTON','Badminton','SPORT','activity',5.5,4.0,8.0,'AGI',74,
 'Explosive lunges and near-constant direction change.',
 '[{"key":"format","label":"Format","type":"select","options":["Singles","Doubles","Drills"],"required":true},
   {"key":"games","label":"Games","type":"number","step":1},
   {"key":"result","label":"Result","type":"text"}]'),

('CRICKET','Cricket','SPORT','circle-dot',4.8,3.0,7.5,'AGI',71,
 'Long-format skill work with sprint bursts.',
 '[{"key":"role","label":"Role","type":"select","options":["Batting","Bowling","Fielding","All-round","Nets"],"required":true},
   {"key":"overs","label":"Overs","type":"number","step":1},
   {"key":"runs","label":"Runs","type":"number","step":1},
   {"key":"wickets","label":"Wickets","type":"number","step":1}]'),

('BASKETBALL','Basketball','SPORT','dribbble',6.5,4.5,9.5,'AGI',76,
 'Intermittent high intensity with heavy deceleration load.',
 '[{"key":"format","label":"Format","type":"select","options":["Full court","Half court","3x3","Shooting drills"],"required":true},
   {"key":"points","label":"Points","type":"number","step":1}]'),

('RACQUET','Tennis / Padel','SPORT','circle',7.0,4.5,9.0,'AGI',79,
 'Social, competitive, and relentlessly repeatable.',
 '[{"key":"sport","label":"Sport","type":"select","options":["Tennis","Padel","Squash","Pickleball","Table Tennis"],"required":true},
   {"key":"format","label":"Format","type":"select","options":["Singles","Doubles","Drills"]},
   {"key":"sets","label":"Sets played","type":"number","step":1}]'),

('MOBILITY','Mobility & Stretching','RECOVERY','stretch-horizontal',2.3,1.5,3.5,'VIT',68,
 'The work that keeps the other work available.',
 '[{"key":"areas","label":"Areas","type":"text","placeholder":"Hips, thoracic spine, ankles"},
   {"key":"method","label":"Method","type":"select","options":["Static","Dynamic","PNF","Foam rolling","Banded"]}]'),

('ZONE2','Zone 2 Cardio','ENDURANCE','heart-pulse',5.0,4.0,6.5,'VIT',81,
 'Conversational pace. Builds the aerobic base everything sits on.',
 '[{"key":"modality","label":"Modality","type":"select","options":["Run","Bike","Row","Incline walk","Elliptical","Swim"],"required":true},
   {"key":"avg_hr","label":"Avg heart rate","type":"number","unit":"bpm","min":60,"max":200,"required":true},
   {"key":"hr_ceiling","label":"Zone 2 ceiling","type":"number","unit":"bpm"},
   {"key":"time_in_zone","label":"Time in zone","type":"number","unit":"min"}]'),

('RECOVERY','Recovery Protocol','RECOVERY','snowflake',1.5,1.0,2.5,'VIT',62,
 'Deliberate recovery counts as training. Log it honestly.',
 '[{"key":"method","label":"Method","type":"select","options":["Sauna","Cold plunge","Contrast","Massage","Compression","Nap","Breathwork"],"required":true},
   {"key":"temperature_c","label":"Temperature","type":"number","unit":"°C","step":1},
   {"key":"cycles","label":"Cycles","type":"number","step":1}]')
on conflict (code) do update set
  name = excluded.name, category = excluded.category, icon = excluded.icon,
  met_base = excluded.met_base, met_low = excluded.met_low, met_high = excluded.met_high,
  primary_stat = excluded.primary_stat, popularity = excluded.popularity,
  blurb = excluded.blurb, fields = excluded.fields, active = true;

-- ---------------------------------------------------------------------------
--  STRENGTH EXERCISE LIBRARY
-- ---------------------------------------------------------------------------
insert into public.exercises (name, muscle_group, equipment, is_compound) values
-- Chest
('Flat Barbell Bench Press','Chest','Barbell',true),
('Incline Barbell Bench Press','Chest','Barbell',true),
('Flat Dumbbell Press','Chest','Dumbbell',true),
('Incline Dumbbell Press','Chest','Dumbbell',true),
('Machine Chest Press','Chest','Machine',true),
('Smith Machine Bench Press','Chest','Smith',true),
('Cable Fly (High to Low)','Chest','Cable',false),
('Cable Fly (Low to High)','Chest','Cable',false),
('Cable Fly (Mid)','Chest','Cable',false),
('Pec Deck','Chest','Machine',false),
('Dips (Chest Lean)','Chest','Bodyweight',true),
('Push-Up','Chest','Bodyweight',true),
-- Back
('Conventional Deadlift','Back','Barbell',true),
('Barbell Row','Back','Barbell',true),
('Pendlay Row','Back','Barbell',true),
('T-Bar Row (Wide)','Back','Barbell',true),
('T-Bar Row (Narrow)','Back','Barbell',true),
('Seated Cable Row','Back','Cable',true),
('Wide Grip Lat Pulldown','Back','Cable',true),
('Narrow Grip Lat Pulldown','Back','Cable',true),
('Neutral Grip Pulldown','Back','Cable',true),
('Pull-Up','Back','Bodyweight',true),
('Chin-Up','Back','Bodyweight',true),
('Straight Arm Pulldown','Back','Cable',false),
('Single Arm Dumbbell Row','Back','Dumbbell',true),
('Chest Supported Row','Back','Machine',true),
('Face Pull','Back','Cable',false),
-- Shoulders
('Overhead Barbell Press','Shoulders','Barbell',true),
('Seated Dumbbell Shoulder Press','Shoulders','Dumbbell',true),
('Arnold Press','Shoulders','Dumbbell',true),
('Lateral Raise','Shoulders','Dumbbell',false),
('Cable Lateral Raise','Shoulders','Cable',false),
('Rear Delt Fly','Shoulders','Dumbbell',false),
('Rear Delt Cable Cross','Shoulders','Cable',false),
('Upright Row','Shoulders','Barbell',false),
('Shrug','Shoulders','Dumbbell',false),
-- Biceps
('Barbell Curl','Biceps','Barbell',false),
('EZ Bar Curl','Biceps','Barbell',false),
('Dumbbell Curl','Biceps','Dumbbell',false),
('Incline Dumbbell Curl','Biceps','Dumbbell',false),
('Hammer Curl','Biceps','Dumbbell',false),
('Preacher Curl','Biceps','Machine',false),
('Cable Bicep Curl','Biceps','Cable',false),
('Concentration Curl','Biceps','Dumbbell',false),
-- Triceps
('Close Grip Bench Press','Triceps','Barbell',true),
('Skull Crusher','Triceps','Barbell',false),
('Tricep Pushdown (Rope)','Triceps','Cable',false),
('Tricep Pushdown (Bar)','Triceps','Cable',false),
('Overhead Tricep Extension','Triceps','Cable',false),
('Dips (Upright)','Triceps','Bodyweight',true),
('Dumbbell Kickback','Triceps','Dumbbell',false),
-- Legs
('Back Squat','Legs','Barbell',true),
('Front Squat','Legs','Barbell',true),
('Hack Squat','Legs','Machine',true),
('Leg Press','Legs','Machine',true),
('Bulgarian Split Squat','Legs','Dumbbell',true),
('Walking Lunge','Legs','Dumbbell',true),
('Romanian Deadlift','Legs','Barbell',true),
('Stiff Leg Deadlift','Legs','Barbell',true),
('Leg Extension','Legs','Machine',false),
('Lying Leg Curl','Legs','Machine',false),
('Seated Leg Curl','Legs','Machine',false),
('Hip Thrust','Legs','Barbell',true),
('Hip Abduction','Legs','Machine',false),
('Hip Adduction','Legs','Machine',false),
('Standing Calf Raise','Legs','Machine',false),
('Seated Calf Raise','Legs','Machine',false),
('Goblet Squat','Legs','Dumbbell',true),
-- Core
('Hanging Leg Raise','Core','Bodyweight',false),
('Cable Crunch','Core','Cable',false),
('Plank','Core','Bodyweight',false),
('Ab Wheel Rollout','Core','Other',false),
('Russian Twist','Core','Other',false),
('Dead Bug','Core','Bodyweight',false),
('Pallof Press','Core','Cable',false),
-- Olympic / Power
('Power Clean','Olympic','Barbell',true),
('Clean and Jerk','Olympic','Barbell',true),
('Snatch','Olympic','Barbell',true),
('Kettlebell Swing','Olympic','Kettlebell',true),
('Box Jump','Olympic','Bodyweight',true),
('Farmer''s Carry','Olympic','Dumbbell',true)
on conflict (name, muscle_group) do nothing;

-- ---------------------------------------------------------------------------
--  BACKFILL: give existing auth users a hunter row (the trigger only fires
--  for NEW signups). Safe to re-run.
-- ---------------------------------------------------------------------------
insert into public.hunters (id, display_name, awakened_at)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)), now()
from auth.users u
on conflict (id) do nothing;

insert into public.hunter_stats (hunter_id, stat)
select h.id, s
from public.hunters h cross join unnest(enum_range(null::stat_key)) s
on conflict do nothing;

insert into public.nutrition_targets (hunter_id) select id from public.hunters
on conflict do nothing;

insert into public.user_settings (hunter_id, email)
select h.id, u.email from public.hunters h join auth.users u on u.id = h.id
on conflict do nothing;
