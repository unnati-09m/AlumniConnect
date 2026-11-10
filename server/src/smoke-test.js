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
    skills:['JavaScript'],interests:['Mentorship']
  });
  const student=newStudent.token;
  assert.equal(newStudent.user.role,'student');
  const profile=await ok('/profile',student);
  assert.equal(profile.student_id,'SMOKE-'+suffix);
  await ok('/profile',student,'PUT',{department:'Information Technology'});
  const updated=await ok('/profile',student);
  assert.equal(updated.student_id,'SMOKE-'+suffix,'partial profile update preserves other fields');
  assert.equal(updated.department,'Information Technology');

  const alumniProfile=await ok('/profile',alumni);
  const directory=await ok('/alumni',student);
  assert.ok(directory.some(person=>person.id===alumniProfile.id),'student sees verified alumni');

  const mentorship=await ok('/mentorship',student,'POST',{
    alumni_id:alumniProfile.id,topic:'Smoke test mentoring',message:'Please guide me about career planning.'
  });
  const mentorInbox=await ok('/mentorship',alumni);
  assert.ok(mentorInbox.some(item=>item.id===mentorship.id&&item.student_name==='Smoke Student'),'alumnus sees student request');
  await ok('/mentorship/'+mentorship.id,alumni,'PATCH',{status:'accepted'});
  const studentRequests=await ok('/mentorship',student);
  assert.equal(studentRequests.find(item=>item.id===mentorship.id).status,'accepted');

  const opportunity=await ok('/opportunities',alumni,'POST',{
    title:'Smoke test internship',company:'Demo Labs',description:'A test listing for the automated workflow.',
    type:'internship',location:'Remote'
  });
  const application=await ok('/opportunities/'+opportunity.id+'/apply',student,'POST',{note:'Interested in this role.'});
  const mentorApplicants=await ok('/managed-applications',alumni);
  assert.ok(mentorApplicants.some(item=>item.id===application.id),'opportunity owner sees applicant');
  await ok('/applications/'+application.id+'/status',alumni,'PATCH',{status:'shortlisted'});
  const myApplications=await ok('/my-applications',student);
  assert.equal(myApplications.find(item=>item.id===application.id).status,'shortlisted');

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

  const forbidden=await call('/admin/users',student);
  assert.equal(forbidden.response.status,403,'students cannot access admin user management');
  const removedRecruiter=await call('/auth/login','', 'POST',{email:'recruiter@alumniconnect.test',password:'Demo@123'});
  assert.equal(removedRecruiter.response.status,401,'legacy recruiter account has been removed');
  console.log('AlumniConnect end-to-end API smoke tests passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
