import assert from 'node:assert/strict';

const API = process.env.API_URL || 'http://localhost:4000/api';
async function call(path, token, method='GET', body) {
  const response = await fetch(API+path,{
    method,
    headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const type=response.headers.get('content-type')||'';
  const data=type.includes('application/json')?await response.json():await response.text();
  return {response,data};
}
async function ok(path,token,method='GET',body) {
  const {response,data}=await call(path,token,method,body);
  if(!response.ok)throw new Error(method+' '+path+' failed ('+response.status+'): '+(data.message||data));
  return data;
}
async function login(email) {
  const result=await ok('/auth/login','', 'POST',{email,password:'Demo@123'});
  assert.ok(result.token,'login returns JWT');
  return result.token;
}
async function run() {
  const health=await ok('/health');
  assert.equal(health.status,'ok');
  assert.equal(health.database,'connected');

  const admin=await login('admin@alumniconnect.test');
  const alumni=await login('alumni@alumniconnect.test');
  const adminUsers=await ok('/admin/users',admin);
  assert.ok(adminUsers.length>=5,'admin sees institution accounts');
  assert.ok(adminUsers.every(user=>['admin','alumni','student'].includes(user.role)),'only the three supported account roles exist');
  for (const forbiddenRole of ['admin','faculty','recruiter']) {
    const rejected=await call('/auth/register','', 'POST',{name:'Unsupported Role',email:'unsupported.'+forbiddenRole+'.'+Date.now()+'@example.test',password:'Testing@123',role:forbiddenRole});
    assert.equal(rejected.response.status,400,forbiddenRole+' cannot self-register');
  }

  const suffix=Date.now().toString();
  const newStudent=await ok('/auth/register','', 'POST',{
    name:'Smoke Student',email:'smoke.student.'+suffix+'@example.test',password:'Testing@123',
    role:'student',student_id:'SMOKE-'+suffix,department:'Computer Science',degree:'B.Tech',current_year:'Third Year',graduation_year:2027,
    skills:['JavaScript'],interests:['Mentorship'],career_interests:['Full Stack Engineering'],bio:'Aspiring software engineer.'
  });
  const student=newStudent.token;
  assert.equal(newStudent.user.role,'student');
  const profile=await ok('/profile',student);
  assert.equal(profile.student_id,'SMOKE-'+suffix);
  assert.equal(profile.bio,'Aspiring software engineer.');
  await ok('/profile',student,'PUT',{department:'Information Technology',bio:'Updated student bio.'});
  const updated=await ok('/profile',student);
  assert.equal(updated.student_id,'SMOKE-'+suffix,'partial profile update preserves other fields');
  assert.equal(updated.department,'Information Technology');
  assert.equal(updated.bio,'Updated student bio.');

  const alumniProfile=await ok('/profile',alumni);
  const directory=await ok('/alumni',student);
  assert.ok(directory.some(person=>person.id===alumniProfile.id),'student sees verified alumni');

  // Verify Alumni Directory detailed profile view (Arshiyan scope)
  const singleAlumni = await ok('/alumni/' + alumniProfile.id, student);
  assert.equal(singleAlumni.id, alumniProfile.id, 'alumni profile endpoint returns alumnus data');
  assert.ok(Array.isArray(singleAlumni.career_history), 'alumni profile includes career history array');

  // Verify Alumni Directory search and department filtering
  const filteredDir = await ok('/alumni?department=Computer%20Science', student);
  assert.ok(filteredDir.every(p => p.department === 'Computer Science'), 'alumni directory filters by department');

  // Verify Career History management: POST, PUT, GET by alumni ID, DELETE (Arshiyan scope)
  const careerEntry = await ok('/career-history', alumni, 'POST', {
    company: 'Test Innovations', job_title: 'Software Engineer', employment_type: 'Full-time',
    location: 'Pune', start_date: '2023-01-01', is_current: true, description: 'Building full stack web apps.'
  });
  assert.equal(careerEntry.company, 'Test Innovations');
  const updatedCareer = await ok('/career-history/' + careerEntry.id, alumni, 'PUT', {
    company: 'Test Innovations Ltd', job_title: 'Senior Software Engineer', employment_type: 'Full-time',
    location: 'Pune', start_date: '2023-01-01', is_current: true, description: 'Leading engineering team.'
  });
  assert.equal(updatedCareer.job_title, 'Senior Software Engineer');
  const publicCareer = await ok('/career-history/alumni/' + alumniProfile.id, student);
  assert.ok(publicCareer.some(c => c.id === careerEntry.id), 'students can view verified alumni public career history');
  await ok('/career-history/' + careerEntry.id, alumni, 'DELETE');

  const mentorship=await ok('/mentorship',student,'POST',{
    alumni_id:alumniProfile.id,topic:'Smoke test mentoring',message:'Please guide me about career planning.'
  });
  const mentorInbox=await ok('/mentorship',alumni);
  assert.ok(mentorInbox.some(item=>item.id===mentorship.id&&item.student_name==='Smoke Student'),'alumnus sees student request');
  await ok('/mentorship/'+mentorship.id,alumni,'PATCH',{status:'accepted'});
  const studentRequests=await ok('/mentorship',student);
  assert.equal(studentRequests.find(item=>item.id===mentorship.id).status,'accepted');

  // Verify Opportunities and Applications (Arshiyan scope)
  const opportunity=await ok('/opportunities',alumni,'POST',{
    title:'Smoke test internship',company:'Demo Labs',description:'A test listing for the automated workflow.',
    type:'internship',location:'Remote'
  });
  // Search and filter opportunities
  const filteredOpps = await ok('/opportunities?type=internship&search=Demo', student);
  assert.ok(filteredOpps.some(o => o.id === opportunity.id), 'opportunities search and type filtering works');

  // Edit opportunity (Arshiyan scope)
  const updatedOpp = await ok('/opportunities/' + opportunity.id, alumni, 'PATCH', {
    title: 'Smoke test internship (Updated)'
  });
  assert.equal(updatedOpp.title, 'Smoke test internship (Updated)', 'opportunity editing works');

  const application=await ok('/opportunities/'+opportunity.id+'/apply',student,'POST',{note:'Interested in this role.',resume_url:'https://example.com/resume.pdf'});
  assert.equal(application.resume_url, 'https://example.com/resume.pdf', 'application stores resume URL');
  const mentorApplicants=await ok('/managed-applications',alumni);
  assert.ok(mentorApplicants.some(item=>item.id===application.id),'opportunity owner sees applicant');
  await ok('/applications/'+application.id+'/status',alumni,'PATCH',{status:'shortlisted'});
  const myApplications=await ok('/my-applications',student);
  assert.equal(myApplications.find(item=>item.id===application.id).status,'shortlisted');

  // Non-owner cannot edit or delete opportunity
  const forbiddenOppEdit = await call('/opportunities/' + opportunity.id, student, 'PATCH', { title: 'Hacked' });
  assert.equal(forbiddenOppEdit.response.status, 403, 'students cannot edit opportunities');

  // Delete opportunity (Arshiyan scope)
  await ok('/opportunities/' + opportunity.id, alumni, 'DELETE');

  const event=await ok('/events',admin,'POST',{
    title:'Smoke test community event',description:'An event used by automated tests.',venue:'Online',
    starts_at:new Date(Date.now()+10*86400000).toISOString()
  });
  await ok('/events/'+event.id+'/register',student,'POST',{});
  const events=await ok('/events',student);
  assert.ok(events.some(item=>item.id===event.id&&item.registered),'student event registration is visible');
  const duplicate=await call('/events/'+event.id+'/register',student,'POST',{});
  assert.equal(duplicate.response.status,409,'duplicate event registration is blocked');

  await ok('/donation-pledges',alumni,'POST',{amount:250,purpose:'Student learning resources',note:'Automated smoke test'});
  const pledges=await ok('/donation-pledges',admin);
  assert.ok(pledges.some(item=>item.alumni_name==='Aarav Alumni'),'admin sees pledge interest');

  await ok('/announcements',admin,'POST',{title:'Smoke announcement',body:'A test institution update.',audience:'students'});
  const notices=await ok('/notifications',student);
  assert.ok(notices.length>0,'student receives notifications');

  const pending=await ok('/auth/register','', 'POST',{
    name:'Pending Alumni',email:'smoke.alumni.'+suffix+'@example.test',password:'Testing@123',
    role:'alumni',department:'Computer Science',graduation_year:2025,company:'New Company'
  });
  assert.equal(pending.user.status,'pending');
  const pendingUser=(await ok('/admin/users',admin)).find(user=>user.email==='smoke.alumni.'+suffix+'@example.test');
  assert.ok(pendingUser,'admin sees pending alumnus');
  await ok('/admin/users/'+pendingUser.id+'/verification',admin,'PATCH',{decision:'approve'});
  const approved=await ok('/auth/login','', 'POST',{email:'smoke.alumni.'+suffix+'@example.test',password:'Testing@123'});
  assert.equal(approved.user.status,'active');

  const reports=await ok('/admin/reports',admin);
  assert.ok(Array.isArray(reports.usersByRole));
  const csv=await call('/admin/alumni.csv',admin);
  assert.equal(csv.response.status,200);
  assert.match(csv.data,/Graduation Year/);

  const csv2=await call('/alumni/export/csv',admin);
  assert.equal(csv2.response.status,200, 'admin can export alumni CSV via alumni route');
  assert.match(csv2.data,/Graduation Year/);
  const forbiddenCsv=await call('/alumni/export/csv',student);
  assert.equal(forbiddenCsv.response.status,403,'students cannot export alumni CSV');

  const forbidden=await call('/admin/users',student);
  assert.equal(forbidden.response.status,403,'students cannot access admin user management');
  const removedRecruiter=await call('/auth/login','', 'POST',{email:'recruiter@alumniconnect.test',password:'Demo@123'});
  assert.equal(removedRecruiter.response.status,401,'legacy recruiter account has been removed');
  console.log('AlumniConnect end-to-end API smoke tests passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
