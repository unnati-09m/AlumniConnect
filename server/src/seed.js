import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const {Pool}=pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:undefined});
const password=process.env.DEMO_PASSWORD||'Demo@123';
const hash=await bcrypt.hash(password,12);

try {
  const accounts=[
    ['admin','Demo Admin','admin@alumniconnect.test','admin','active'],
    ['alumni','Aarav Alumni','alumni@alumniconnect.test','alumni','active'],
    ['alumni2','Sana Mehta','sana@alumniconnect.test','alumni','active'],
    ['alumni3','Kabir Shah','kabir@alumniconnect.test','alumni','active'],
    ['alumni4','Riya Deshmukh','riya@alumniconnect.test','alumni','active'],
    ['student','Student Demo','student@alumniconnect.test','student','active'],
  ];
  const ids={};
  for (const [key,name,email,role,status] of accounts) {
    const result=await pool.query(
      'INSERT INTO users (name,email,password_hash,role,status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,status=EXCLUDED.status RETURNING id',
      [name,email,hash,role,status]
    );
    ids[key]=result.rows[0].id;
  }
  const alumni=[
    [ids.alumni,2022,'Computer Science','B.Tech','Example Technologies','Software Engineer','Pune','Happy to guide students on software engineering and early careers.',['JavaScript','React','Node.js','PostgreSQL']],
    [ids.alumni2,2021,'Information Technology','B.Tech','Northstar Labs','Product Analyst','Mumbai','Interested in product thinking, analytics and mentoring.',['SQL','Product Analytics','Excel']],
    [ids.alumni3,2020,'Electronics','B.E.','Bright Circuits','Systems Engineer','Bengaluru','Enjoys helping students explore engineering careers.',['Embedded Systems','Python','Testing']],
    [ids.alumni4,2023,'Computer Science','B.Tech','Cloud Nine','Frontend Developer','Remote','Frontend developer interested in accessible user experiences.',['React','CSS','Accessibility']]
  ];
  for (const [id,year,department,degree,company,title,location,bio,skills] of alumni) {
    await pool.query(
      'INSERT INTO alumni_profiles (user_id,graduation_year,department,degree,company,job_title,location,bio,skills,is_public,is_verified) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,TRUE) ON CONFLICT(user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year,department=EXCLUDED.department,degree=EXCLUDED.degree,company=EXCLUDED.company,job_title=EXCLUDED.job_title,location=EXCLUDED.location,bio=EXCLUDED.bio,skills=EXCLUDED.skills,is_public=TRUE,is_verified=TRUE',
      [id,year,department,degree,company,title,location,bio,skills]
    );
  }
  await pool.query('INSERT INTO student_profiles (user_id,student_id,department,degree,current_year,graduation_year,skills,interests) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id) DO NOTHING',[ids.student,'DEMO-001','Computer Science','B.Tech','Third Year',2027,['JavaScript','SQL'],['Mentorship','Web Development']]);
  await pool.query("INSERT INTO opportunities (alumni_id,created_by,title,company,description,type,location,apply_by) SELECT $1,$1,'Frontend Developer Intern','Example Labs','Work with a product team on React interfaces.','internship','Remote',CURRENT_DATE+INTERVAL '30 days' WHERE NOT EXISTS(SELECT 1 FROM opportunities WHERE title='Frontend Developer Intern' AND COALESCE(created_by,alumni_id)=$1)",[ids.alumni]);
  await pool.query("INSERT INTO opportunities (created_by,title,company,description,type,location,apply_by) SELECT $1,'Graduate Engineer Trainee','Example Technologies','Entry-level engineering role for graduating students.','job','Pune',CURRENT_DATE+INTERVAL '45 days' WHERE NOT EXISTS(SELECT 1 FROM opportunities WHERE title='Graduate Engineer Trainee' AND created_by=$1)",[ids.admin]);
  await pool.query("INSERT INTO events (created_by,title,description,venue,starts_at) SELECT $1,'Alumni Connect Meetup','Meet alumni, ask questions and build professional connections.','Main Auditorium',NOW()+INTERVAL '14 days' WHERE NOT EXISTS(SELECT 1 FROM events WHERE title='Alumni Connect Meetup')",[ids.admin]);
  console.log('Demo data ready. All demo accounts use password: '+password);
} finally { await pool.end(); }
