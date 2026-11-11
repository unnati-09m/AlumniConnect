import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowRight, Bell, BriefcaseBusiness, Building2,
  CalendarDays, Check, ChevronRight, CircleHelp, ClipboardList, GraduationCap,
  Handshake, HeartHandshake, LayoutDashboard, LogOut, Megaphone, Menu,
  Network, Plus, Search, Settings, ShieldCheck, Sparkles, Users, X
} from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || '') + '/api';
const DEMO_PASSWORD = 'Demo@123';

async function request(path, token, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {})
    }
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof data === 'string' ? data : data.message || 'Request failed.');
  return data;
}

const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const dateText = value => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';
const dateTimeText = value => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Not set';
const pretty = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', options, rows = 0 }) {
  return <label className="field"><span>{label}</span>
    {options ? <select required={required} value={value ?? ''} onChange={e => onChange(e.target.value)}>
      <option value="">Select {label.toLowerCase()}</option>{options.map(option => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}
    </select> : rows ? <textarea required={required} rows={rows} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} /> :
      <input required={required} type={type} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}
  </label>;
}
function Stat({ label, value, note, icon: Icon, tone = 'blue' }) {
  return <article className="stat-card"><div className={'stat-icon ' + tone}><Icon size={19}/></div><div className="stat-copy"><strong>{value ?? 0}</strong><span>{label}</span>{note && <small>{note}</small>}</div></article>;
}
function Empty({ title, detail }) {
  return <div className="empty-state"><div className="empty-icon"><CircleHelp size={22}/></div><strong>{title}</strong><p>{detail}</p></div>;
}
function PageTitle({ eyebrow, title, detail, action }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>{action}</div>;
}
function Avatar({ name, size = 'normal' }) {
  return <div className={'avatar ' + size}>{initials(name)}</div>;
}

const navigation = {
  student: [
    ['Overview','Overview',LayoutDashboard],['Alumni Directory','Alumni Directory',Users],['Mentorship','Mentorship',Handshake],
    ['Opportunities','Opportunities',BriefcaseBusiness],['My Applications','My Applications',ClipboardList],['Events','Events',CalendarDays],
    ['Announcements','Announcements',Megaphone],['Notifications','Notifications',Bell],['My Profile','My Profile',Settings]
  ],
  alumni: [
    ['Overview','Overview',LayoutDashboard],['Mentorship Requests','Mentorship',Handshake],['Opportunities','Opportunities',BriefcaseBusiness],
    ['Applicants','Applicants',ClipboardList],['Events','Events',CalendarDays],['Career History','Career History',Activity],
    ['Donation Support','Donation Support',HeartHandshake],['Notifications','Notifications',Bell],['My Profile','My Profile',Settings]
  ],
  admin: [
    ['Overview','Overview',LayoutDashboard],['User Management','User Management',ShieldCheck],['Alumni Directory','Alumni Directory',Users],
    ['Mentorship','Mentorship',Handshake],['Opportunities','Opportunities',BriefcaseBusiness],['Events','Events',CalendarDays],
    ['Donation Tracking','Donation Tracking',HeartHandshake],['Reports','Reports',Activity],['Announcements','Announcements',Megaphone],
    ['Notifications','Notifications',Bell],['My Profile','My Profile',Settings]
  ]
};

export default function App() {
  const [token,setToken] = useState(localStorage.getItem('ac_token') || '');
  const [user,setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('ac_user') || 'null'); } catch { return null; } });
  const [page,setPage] = useState('Overview');
  const [mobileNav,setMobileNav] = useState(false);
  const [loading,setLoading] = useState(Boolean(localStorage.getItem('ac_token')));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const [dashboard,setDashboard] = useState({});
  const [profile,setProfile] = useState({});
  const [alumni,setAlumni] = useState([]);
  const [mentorship,setMentorship] = useState([]);
  const [opportunities,setOpportunities] = useState([]);
  const [applications,setApplications] = useState([]);
  const [events,setEvents] = useState([]);
  const [notifications,setNotifications] = useState([]);
  const [announcements,setAnnouncements] = useState([]);
  const [adminUsers,setAdminUsers] = useState([]);
  const [reports,setReports] = useState(null);
  const [pledges,setPledges] = useState([]);
  const [careerHistory,setCareerHistory] = useState([]);
  const [search,setSearch] = useState('');
  const [authMode,setAuthMode] = useState('login');
  const [login,setLogin] = useState({email:'student@alumniconnect.test',password:DEMO_PASSWORD});
  const [register,setRegister] = useState({name:'',email:'',password:'',role:'student',student_id:'',department:'',degree:'',current_year:'',graduation_year:'',company:'',job_title:'',location:'',linkedin_url:''});
  const [profileDraft,setProfileDraft] = useState({});
  const [mentorTarget,setMentorTarget] = useState(null);
  const [mentorForm,setMentorForm] = useState({topic:'Career guidance',message:''});
  const [jobForm,setJobForm] = useState({title:'',company:'',description:'',type:'internship',location:'Remote',apply_by:'',application_url:''});
  const [eventForm,setEventForm] = useState({title:'',description:'',venue:'Campus',starts_at:''});
  const [careerForm,setCareerForm] = useState({company:'',job_title:'',employment_type:'Full-time',location:'',start_date:'',end_date:'',is_current:false,description:''});
  const [pledgeForm,setPledgeForm] = useState({amount:'',purpose:'',note:''});
  const [announcementForm,setAnnouncementForm] = useState({title:'',body:'',audience:'all'});

  const loadAll = useCallback(async (authToken, currentUser) => {
    if (!authToken || !currentUser) return;
    const get = (path,fallback) => request(path,authToken).catch(() => fallback);
    const tasks = [
      get('/dashboard',{}), get('/profile',{}), get('/notifications',[]), get('/announcements',[]), get('/events',[])
    ];
    if (['student','alumni','admin'].includes(currentUser.role)) tasks.push(get('/alumni',[]));
    else tasks.push(Promise.resolve([]));
    if (['student','alumni','admin'].includes(currentUser.role)) tasks.push(get('/opportunities',[]));
    else tasks.push(Promise.resolve([]));
    if (['student','alumni','admin'].includes(currentUser.role)) tasks.push(get('/mentorship',[]));
    else tasks.push(Promise.resolve([]));
    if (currentUser.role === 'student') tasks.push(get('/my-applications',[]));
    else tasks.push(Promise.resolve([]));
    if (['alumni','admin'].includes(currentUser.role)) tasks.push(get('/managed-applications',[]));
    else tasks.push(Promise.resolve([]));
    if (currentUser.role === 'alumni') tasks.push(get('/career-history',[]));
    else tasks.push(Promise.resolve([]));
    if (currentUser.role === 'admin') {
      tasks.push(get('/admin/users',[]),get('/admin/reports',null),get('/donation-pledges',[]));
    } else tasks.push(Promise.resolve([]),Promise.resolve(null),Promise.resolve([]));
    const values = await Promise.all(tasks);
    setDashboard(values[0]); setProfile(values[1]); setNotifications(values[2]); setAnnouncements(values[3]); setEvents(values[4]);
    setAlumni(values[5]); setOpportunities(values[6]); setMentorship(values[7]); setApplications(values[8]);
    setManagedApplications(values[9]); setCareerHistory(values[10]); setAdminUsers(values[11]); setReports(values[12]); setPledges(values[13]);
    setProfileDraft(values[1]);
  }, []);
  const [managedApplications,setManagedApplications] = useState([]);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let cancelled = false;
    request('/auth/me',token).then(async current => {
      if (cancelled) return;
      setUser(current); localStorage.setItem('ac_user',JSON.stringify(current));
      await loadAll(token,current);
    }).catch(() => {
      localStorage.removeItem('ac_token'); localStorage.removeItem('ac_user'); setToken(''); setUser(null);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token,loadAll]);

  const refresh = async () => { if (token && user) await loadAll(token,user); };
  const run = async (path,method='POST',body={}) => {
    setError(''); setSuccess(''); setBusy(true);
    try {
      await request(path,token,{method,body:JSON.stringify(body)});
      setSuccess('Changes saved successfully.');
      await refresh();
      return true;
    } catch (err) { setError(err.message); return false; }
    finally { setBusy(false); }
  };

  const signIn = async event => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await request('/auth/login','',{method:'POST',body:JSON.stringify(login)});
      localStorage.setItem('ac_token',result.token); localStorage.setItem('ac_user',JSON.stringify(result.user));
      setUser(result.user); setToken(result.token); setPage('Overview'); setSuccess('');
      await loadAll(result.token,result.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); setLoading(false); }
  };
  const signUp = async event => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const payload = {...register,graduation_year:register.graduation_year?Number(register.graduation_year):null};
      const result = await request('/auth/register','',{method:'POST',body:JSON.stringify(payload)});
      localStorage.setItem('ac_token',result.token); localStorage.setItem('ac_user',JSON.stringify(result.user));
      setUser(result.user); setToken(result.token); setPage('Overview');
      setSuccess(result.message || 'Account created.');
      await loadAll(result.token,result.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); setLoading(false); }
  };
  const logout = () => {
    localStorage.removeItem('ac_token'); localStorage.removeItem('ac_user');
    setToken(''); setUser(null); setPage('Overview'); setError(''); setSuccess('');
  };

  const filteredAlumni = useMemo(() => alumni.filter(person =>
    [person.name,person.company,person.department,person.job_title,person.graduation_year].join(' ').toLowerCase().includes(search.toLowerCase())
  ),[alumni,search]);

  const changePage = value => { setPage(value); setMobileNav(false); setError(''); setSuccess(''); };

  if (loading) return <div className="loading-screen"><div className="brand-mark"><Network/></div><p>Connecting to your alumni community…</p></div>;
  if (!token || !user) return <AuthScreen authMode={authMode} setAuthMode={setAuthMode} login={login} setLogin={setLogin} register={register} setRegister={setRegister} signIn={signIn} signUp={signUp} busy={busy} error={error}/>;
  if (user.status === 'pending') return <PendingScreen user={user} logout={logout}/>;

  const nav = navigation[user.role] || navigation.student;
  const unread = notifications.filter(item => !item.is_read).length;
  const pageDetails = {
    'Overview':['YOUR COMMUNITY','Overview','A live snapshot of your alumni network.'],
    'Alumni Directory':['NETWORK','Alumni directory','Discover verified alumni, career journeys and people willing to connect.'],
    'Mentorship':['GIVE AND GET GUIDANCE','Mentorship','Build meaningful student–alumni mentoring relationships.'],
    'Opportunities':['CAREER NETWORK','Opportunities','Internships, jobs and projects shared by alumni and the institution.'],
    'My Applications':['CAREER TRACKER','My applications','Track the opportunities you have applied for.'],
    'Applicants':['TALENT PIPELINE','Applicants','Review students who applied to opportunities you manage.'],
    'Events':['COMMUNITY','Events','Reconnect through institution and alumni community events.'],
    'Career History':['YOUR JOURNEY','Career history','Keep your professional progress and career updates in one place.'],
    'Donation Support':['GIVE BACK','Donation support','Record a pledge of support for your institution.'],
    'User Management':['INSTITUTION','User management','Review student and alumni accounts, verify alumni records, and manage access.'],
    'Donation Tracking':['INSTITUTION','Donation tracking','Follow up on alumni pledge interests.'],
    'Reports':['INSIGHTS','Community reports','Understand alumni engagement, opportunities and institutional activity.'],
    'Announcements':['COMMUNICATION','Announcements','Share official updates with the right community audience.'],
    'Notifications':['UPDATES','Notifications','Messages and activity from your community.'],
    'My Profile':['YOUR ACCOUNT','My profile','Keep your information accurate and up to date.']
  };
  const [eyebrow,title,detail] = pageDetails[page] || pageDetails.Overview;

  return <div className="app-frame">
    <aside className={'sidebar '+(mobileNav?'mobile-open':'')}>
      <div className="sidebar-brand"><div className="brand-mark"><Network size={18}/></div><div>Alumni<span>Connect</span><small>INSTITUTIONAL NETWORK</small></div></div>
      <div className="workspace-card"><div className="workspace-logo">AC</div><div><strong>Alumni community</strong><small>{pretty(user.role)} workspace</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav">{nav.map(([label,value,Icon])=><button key={value} className={page===value?'active':''} onClick={()=>changePage(value)}><Icon size={17}/><span>{label}</span>{value==='Notifications'&&unread>0&&<i className="unread-dot"/>}</button>)}</nav>
      <div className="sidebar-foot"><div className="side-help"><Sparkles size={16}/><strong>Stay connected</strong><p>Strong alumni relationships create opportunities for everyone.</p></div>
        <div className="account-mini"><Avatar name={user.name}/><div><strong>{user.name}</strong><small>{pretty(user.role)}</small></div><button title="Sign out" onClick={logout}><LogOut size={17}/></button></div>
      </div>
    </aside>
    {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={()=>setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu/></button>
        <div className="breadcrumb">AlumniConnect <ChevronRight size={14}/> <span>{page}</span></div>
        <div className="topbar-actions">
          <div className="topbar-date">{new Date().toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}</div>
          <button className="icon-btn notification-btn" title="Notifications" onClick={()=>changePage('Notifications')}><Bell size={18}/>{unread>0&&<i/>}</button>
          <div className="top-user"><Avatar name={user.name}/><div><strong>{user.name}</strong><small>{pretty(user.role)}</small></div></div>
        </div>
      </header>
      <div className="content-wrap">
        <PageTitle eyebrow={eyebrow} title={title} detail={detail}
          action={page==='Alumni Directory'?<div className="search-box"><Search size={16}/><input placeholder="Search name, company, department…" value={search} onChange={e=>setSearch(e.target.value)}/></div>:null}/>
        {error&&<div className="alert error"><X size={16}/>{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
        {success&&<div className="alert success"><Check size={16}/>{success}<button onClick={()=>setSuccess('')}><X size={15}/></button></div>}
        {busy&&<div className="saving-line">Saving your changes…</div>}

        {page==='Overview'&&<Overview role={user.role} user={user} data={dashboard} alumni={alumni} mentorship={mentorship} opportunities={opportunities} events={events} announcements={announcements} managedApplications={managedApplications} go={changePage}/>}
        {page==='Alumni Directory'&&<AlumniDirectory people={filteredAlumni} role={user.role} onMentor={person=>{setMentorTarget(person);setMentorForm({topic:'Career guidance',message:''});}}/>}
        {page==='Mentorship'&&<Mentorship items={mentorship} role={user.role} run={run}/>}
        {page==='Opportunities'&&<Opportunities items={opportunities} role={user.role} form={jobForm} setForm={setJobForm} run={run}/>}
        {page==='My Applications'&&<MyApplications items={applications}/>}
        {page==='Applicants'&&<Applicants items={managedApplications} run={run}/>}
        {page==='Events'&&<Events items={events} role={user.role} form={eventForm} setForm={setEventForm} run={run}/>}
        {page==='Career History'&&<CareerHistory items={careerHistory} form={careerForm} setForm={setCareerForm} run={run}/>}
        {page==='Donation Support'&&<DonationSupport form={pledgeForm} setForm={setPledgeForm} run={run}/>}
        {page==='User Management'&&<UserManagement items={adminUsers} run={run}/>}
        {page==='Donation Tracking'&&<DonationTracking items={pledges} run={run}/>}
        {page==='Reports'&&<Reports data={reports} download={async()=>{
          try { const response=await fetch(API+'/admin/alumni.csv',{headers:{Authorization:'Bearer '+token}}); if(!response.ok)throw new Error('CSV export failed.'); const blob=await response.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='alumni-directory.csv'; a.click(); URL.revokeObjectURL(url); setSuccess('Alumni CSV downloaded.'); } catch(err){setError(err.message);}
        }}/>}
        {page==='Announcements'&&<Announcements items={announcements} role={user.role} form={announcementForm} setForm={setAnnouncementForm} run={run}/>}
        {page==='Notifications'&&<Notifications items={notifications} run={run}/>}
        {page==='My Profile'&&<Profile role={user.role} profile={profileDraft} setProfile={setProfileDraft} run={run}/>}
      </div>
      <footer className="footer"><span>AlumniConnect</span><span>Connecting graduates. Creating opportunities.</span></footer>
    </main>
    {mentorTarget&&<MentorshipComposer person={mentorTarget} form={mentorForm} setForm={setMentorForm} close={()=>setMentorTarget(null)} submit={async()=>{
      const ok=await run('/mentorship','POST',{...mentorForm,alumni_id:mentorTarget.id}); if(ok)setMentorTarget(null);
    }}/>}
  </div>;
}

function AuthScreen({authMode,setAuthMode,login,setLogin,register,setRegister,signIn,signUp,busy,error}) {
  const set = (key,value) => setRegister(old=>({...old,[key]:value}));
  return <div className="auth-page">
    <section className="auth-visual"><div className="auth-brand"><div className="brand-mark"><Network/></div> Alumni<span>Connect</span></div>
      <div className="auth-visual-copy"><span className="eyebrow">A NETWORK THAT STAYS WITH YOU</span><h1>Your campus<br/>connections.<br/><em>For life.</em></h1><p>A shared space for graduates, students, faculty and employers to build meaningful relationships and opportunities.</p>
        <div className="auth-points"><span><Users size={16}/> A connected alumni directory</span><span><Handshake size={16}/> Mentorship across generations</span><span><BriefcaseBusiness size={16}/> Careers, events and collaboration</span></div>
      </div><div className="auth-bottom">ALUMNI MANAGEMENT & ENGAGEMENT PLATFORM</div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <div className="auth-switch"><button className={authMode==='login'?'selected':''} onClick={()=>setAuthMode('login')}>Sign in</button><button className={authMode==='register'?'selected':''} onClick={()=>setAuthMode('register')}>Create account</button></div>
      {authMode==='login'?<>
        <span className="eyebrow">WELCOME BACK</span><h2>Sign in to your network</h2><p className="muted">Use your institution or community account to continue.</p>
        {error&&<div className="alert error">{error}</div>}
        <form className="form-stack" onSubmit={signIn}>
          <Field label="Email address" type="email" value={login.email} onChange={v=>setLogin({...login,email:v})} required placeholder="you@institution.edu"/>
          <Field label="Password" type="password" value={login.password} onChange={v=>setLogin({...login,password:v})} required placeholder="Enter your password"/>
          <button className="primary-btn full" disabled={busy}>{busy?'Signing in…':'Sign in'} <ArrowRight size={17}/></button>
        </form>
        <div className="demo-login"><strong>Demo access</strong><p>Try a role to explore the sample workspace.</p><div className="demo-chips">
          {['student','alumni','admin'].map(role=><button key={role} onClick={()=>setLogin({email:role+'@alumniconnect.test',password:DEMO_PASSWORD})}>{pretty(role)}</button>)}
        </div><small>Password for demo accounts: {DEMO_PASSWORD}</small></div>
      </>:<>
        <span className="eyebrow">JOIN YOUR COMMUNITY</span><h2>Create your account</h2><p className="muted">Choose your role and share the details needed for your profile.</p>
        {error&&<div className="alert error">{error}</div>}
        <form className="form-stack register-form" onSubmit={signUp}>
          <Field label="I am registering as" value={register.role} onChange={v=>set('role',v)} options={[{value:'student',label:'Current student'},{value:'alumni',label:'Alumnus / Alumna'}]}/>
          <Field label="Full name" value={register.name} onChange={v=>set('name',v)} required/>
          <Field label="Email address" type="email" value={register.email} onChange={v=>set('email',v)} required/>
          <Field label="Password (minimum 8 characters)" type="password" value={register.password} onChange={v=>set('password',v)} required/>
          {register.role==='student'&&<>
            <div className="form-two"><Field label="Student ID" value={register.student_id} onChange={v=>set('student_id',v)}/><Field label="Department" value={register.department} onChange={v=>set('department',v)} required/></div>
            <div className="form-two"><Field label="Degree" value={register.degree} onChange={v=>set('degree',v)}/><Field label="Current year" value={register.current_year} onChange={v=>set('current_year',v)} placeholder="e.g. Third Year"/></div>
            <Field label="Expected graduation year" type="number" value={register.graduation_year} onChange={v=>set('graduation_year',v)}/>
          </>}
          {register.role==='alumni'&&<>
            <div className="form-two"><Field label="Department" value={register.department} onChange={v=>set('department',v)} required/><Field label="Graduation year" type="number" value={register.graduation_year} onChange={v=>set('graduation_year',v)} required/></div>
            <div className="form-two"><Field label="Degree" value={register.degree} onChange={v=>set('degree',v)}/><Field label="Current company" value={register.company} onChange={v=>set('company',v)}/></div>
            <div className="form-two"><Field label="Job title" value={register.job_title} onChange={v=>set('job_title',v)}/><Field label="Location" value={register.location} onChange={v=>set('location',v)}/></div>
          </>}
          <button className="primary-btn full" disabled={busy}>{busy?'Creating account…':'Create account'} <ArrowRight size={17}/></button>
        </form>
        <p className="approval-note">Alumni registrations require institutional verification before appearing in the student-facing directory.</p>
      </>}
      <div className="auth-legal">By continuing, you agree to use this community platform responsibly.</div>
    </div></section>
  </div>;
}
function PendingScreen({user,logout}) {
  return <div className="pending-page"><div className="pending-card"><div className="pending-icon"><ShieldCheck size={30}/></div><span className="eyebrow">ACCOUNT VERIFICATION</span><h1>Your account is under review</h1><p>Hello {user.name}, your {user.role} registration has been received. The institution administrator must verify your account before you can use the member features.</p><div className="pending-status"><span/> Awaiting institution approval</div><button className="secondary-btn" onClick={logout}>Sign out</button></div></div>;
}

function Overview({role,user,data,alumni,mentorship,opportunities,events,announcements,managedApplications,go}) {
  const firstName=user.name.split(' ')[0];
  const cards = role==='student'
    ? [['Mentorship requests',data.mentorshipRequests,Handshake,'blue'],['Applications sent',data.applications,ClipboardList,'violet'],['Registered events',data.registeredEvents,CalendarDays,'orange'],['Verified alumni',data.verifiedAlumni,Users,'green']]
    : role==='alumni'
    ? [['Pending requests',data.pendingMentorship,Handshake,'orange'],['Opportunities posted',data.postedOpportunities,BriefcaseBusiness,'blue'],['Student applicants',data.applicants,Users,'violet'],['Career entries',data.careerEntries,Activity,'green']]
    : [['Total users',data.totalUsers,Users,'blue'],['Alumni members',data.alumni,GraduationCap,'violet'],['Pending approvals',data.pendingApprovals,ShieldCheck,'orange'],['Mentorship requests',data.mentorshipRequests,Handshake,'green'],['Opportunities',data.opportunities,BriefcaseBusiness,'blue'],['Community events',data.events,CalendarDays,'orange']];
  const subtitle = role==='student'?'Discover graduates, ask for guidance and take the next step in your career.':role==='alumni'?'Share your experience, guide current students and keep your career story current.':'Oversee the institution’s alumni relationships and engagement activity.';
  return <div className="dashboard-content">
    <section className="welcome-banner"><div><span className="welcome-kicker">GOOD TO HAVE YOU HERE</span><h2>Welcome back, {firstName}.</h2><p>{subtitle}</p></div><div className="welcome-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-center"><Network size={34}/></div><span className="art-node node-one"><Users/></span><span className="art-node node-two"><Handshake/></span><span className="art-node node-three"><BriefcaseBusiness/></span></div></section>
    <div className="stats-grid">{cards.map(([label,value,icon,tone])=><Stat key={label} label={label} value={value} icon={icon} tone={tone}/>)}</div>
    <div className="dashboard-grid">
      <section className="panel quick-panel"><div className="panel-heading"><div><span className="eyebrow">QUICK ACCESS</span><h3>Explore your workspace</h3></div></div>
        <div className="quick-grid">
          {(role==='student'?[['Alumni Directory','Find graduates to learn from.',Users],['Mentorship','Ask for professional guidance.',Handshake],['Opportunities','Explore jobs and internships.',BriefcaseBusiness],['Events','Meet your community.',CalendarDays]]
          :role==='alumni'?[['Mentorship','Respond to student requests.',Handshake],['Opportunities','Share a career opportunity.',BriefcaseBusiness],['Career History','Update your professional journey.',Activity],['Events','Reconnect with your institution.',CalendarDays]]
          :[['User Management','Review new registrations.',ShieldCheck],['Alumni Directory','Review alumni records.',Users],['Reports','Explore community performance.',Activity],['Announcements','Communicate with the community.',Megaphone]]).map(([name,copy,Icon])=><button className="quick-card" key={name} onClick={()=>go(name)}><span className="quick-icon"><Icon size={18}/></span><strong>{name}</strong><small>{copy}</small><ArrowRight size={15}/></button>)}
        </div>
      </section>
      <section className="panel side-feed"><div className="panel-heading"><div><span className="eyebrow">COMMUNITY UPDATES</span><h3>Latest announcements</h3></div><button className="text-link" onClick={()=>go('Announcements')}>View all <ChevronRight size={14}/></button></div>
        {announcements.length?announcements.slice(0,3).map(item=><div className="feed-item" key={item.id}><span className="feed-dot"/><div><strong>{item.title}</strong><p>{item.body}</p><small>{item.author||'Institution'} · {dateText(item.created_at)}</small></div></div>):<Empty title="No announcements yet" detail="Institution updates will appear here."/>}
      </section>
    </div>
    <div className="dashboard-grid lower-grid">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">{role==='alumni'?'STUDENT CONNECTIONS':'COMMUNITY'}</span><h3>{role==='alumni'?'Mentorship activity':'Upcoming events'}</h3></div><button className="text-link" onClick={()=>go(role==='alumni'?'Mentorship':'Events')}>View all <ChevronRight size={14}/></button></div>
        {role==='alumni'?mentorship.filter(x=>x.status==='pending').slice(0,3).map(item=><div className="mini-row" key={item.id}><Avatar name={item.student_name}/><div><strong>{item.student_name}</strong><small>{item.topic}</small></div><span className="status-pill pending">Pending</span></div>):events.slice(0,3).map(item=><div className="mini-row" key={item.id}><div className="event-mini-date"><b>{new Date(item.starts_at).getDate()}</b><small>{new Date(item.starts_at).toLocaleString('en',{month:'short'})}</small></div><div><strong>{item.title}</strong><small>{item.venue} · {dateTimeText(item.starts_at)}</small></div><span className="muted-count">{item.attendee_count||0} joined</span></div>)}
        {role==='alumni'&&!mentorship.some(x=>x.status==='pending')&&<Empty title="You're all caught up" detail="New student mentorship requests will appear here."/>}
        {role!=='alumni'&&!events.length&&<Empty title="No upcoming events" detail="New community events will appear here."/>}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">NETWORK SPOTLIGHT</span><h3>Alumni to discover</h3></div><button className="text-link" onClick={()=>go('Alumni Directory')}>Browse <ChevronRight size={14}/></button></div>
        {alumni.slice(0,3).map(person=><div className="mini-row" key={person.id}><Avatar name={person.name}/><div><strong>{person.name}</strong><small>{person.job_title||'Alumni'} {person.company?'at '+person.company:''}</small></div><span className="verified-mark"><ShieldCheck size={15}/></span></div>)}
        {!alumni.length&&<Empty title="No alumni profiles yet" detail="Verified and public alumni profiles will appear here."/>}
      </section>
    </div>
  </div>;
}

function AlumniDirectory({people,role,onMentor}) {
  const [department,setDepartment]=useState('all');
  const departments=[...new Set(people.map(p=>p.department).filter(Boolean))];
  const visible=department==='all'?people:people.filter(p=>p.department===department);
  return <div className="panel">
    <div className="directory-toolbar"><div><h3>{visible.length} verified alumni</h3><p>Connect with people who have walked the path before you.</p></div><select value={department} onChange={e=>setDepartment(e.target.value)}><option value="all">All departments</option>{departments.map(d=><option key={d}>{d}</option>)}</select></div>
    {visible.length?<div className="people-grid">{visible.map(person=><article className="person-card" key={person.id}><div className="person-card-top"><Avatar name={person.name} size="large"/><span className="verified-badge"><ShieldCheck size={13}/> Verified</span></div><h3>{person.name}</h3><p className="person-role">{person.job_title||'Alumni member'} {person.company?'at '+person.company:''}</p><div className="person-meta"><span><GraduationCap size={14}/>{person.department}</span><span><CalendarDays size={14}/>Class of {person.graduation_year}</span><span><Building2 size={14}/>{person.location||'Location not shared'}</span></div><p className="person-bio">{person.bio||'Open to connecting with the institution community.'}</p>{person.skills?.length>0&&<div className="skill-list">{person.skills.slice(0,5).map(skill=><span key={skill}>{skill}</span>)}</div>}
      {person.linkedin_url&&<a className="profile-url" href={person.linkedin_url} target="_blank" rel="noreferrer">LinkedIn profile <ArrowRight size={13}/></a>}
      {role==='student'&&<button className="outline-btn full" onClick={()=>onMentor(person)}><Handshake size={15}/> Request mentorship</button>}</article>)}</div>:<Empty title="No matching alumni found" detail="Try another name, company or department."/>}
  </div>;
}

function Mentorship({items,role,run}) {
  const [filter,setFilter]=useState('all');
  const list=filter==='all'?items:items.filter(item=>item.status===filter);
  return <section className="panel">
    <div className="directory-toolbar"><div><h3>{role==='alumni'?'Requests for your guidance':'Mentorship connections'}</h3><p>{role==='alumni'?'Review incoming requests and respond to students.':'Follow the status of student–alumni mentorship requests.'}</p></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{['pending','accepted','declined','completed'].map(v=><option key={v}>{v}</option>)}</select></div>
    {list.length?<div className="request-list">{list.map(item=><article className="request-card" key={item.id}><Avatar name={role==='alumni'?item.student_name:item.alumni_name}/><div className="request-main"><div className="request-top"><strong>{role==='alumni'?item.student_name:item.alumni_name}</strong><span className={'status-pill '+item.status}>{pretty(item.status)}</span></div><h4>{item.topic}</h4><p>{item.message||'No additional message.'}</p><small>{role==='alumni'?item.student_email||'Student':'Mentorship request'} · {dateText(item.created_at)}</small></div>
      {role==='alumni'&&item.status==='pending'&&<div className="request-actions"><button className="primary-btn small" onClick={()=>run('/mentorship/'+item.id,'PATCH',{status:'accepted'})}><Check size={14}/> Accept</button><button className="outline-btn small" onClick={()=>run('/mentorship/'+item.id,'PATCH',{status:'declined'})}>Decline</button></div>}
      {role==='alumni'&&item.status==='accepted'&&<button className="outline-btn small" onClick={()=>run('/mentorship/'+item.id,'PATCH',{status:'completed'})}>Mark completed</button>}</article>)}</div>:<Empty title="No mentorship requests" detail={role==='alumni'?'New requests from students will appear here.':'When you connect with a mentor, the requests will be shown here.'}/>}
  </section>;
}

function MentorshipComposer({person,form,setForm,close,submit}) {
  return <div className="modal-backdrop" onMouseDown={close}><section className="modal-card" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={close}><X/></button><span className="eyebrow">START A CONVERSATION</span><h2>Request mentorship</h2><p className="muted">Your request will be sent directly to {person.name}.</p><div className="mentor-preview"><Avatar name={person.name}/><div><strong>{person.name}</strong><small>{person.job_title} {person.company?'at '+person.company:''}</small></div></div><form className="form-stack" onSubmit={e=>{e.preventDefault();submit();}}><Field label="What would you like guidance on?" value={form.topic} onChange={v=>setForm({...form,topic:v})} required placeholder="Career guidance, interviews, higher studies…"/><Field label="Message" value={form.message} onChange={v=>setForm({...form,message:v})} rows={4} placeholder="Introduce yourself and share what you'd like to learn."/><button className="primary-btn full">Send mentorship request <ArrowRight size={16}/></button></form></section></div>;
}

function Opportunities({items,role,form,setForm,run}) {
  const [showForm,setShowForm]=useState(false);
  const canPost=['alumni','admin'].includes(role);
  const set=(key,value)=>setForm(old=>({...old,[key]:value}));
  const submit=async e=>{e.preventDefault();const ok=await run('/opportunities','POST',form);if(ok){setShowForm(false);setForm({title:'',company:'',description:'',type:'internship',location:'Remote',apply_by:'',application_url:''});}};
  return <div className="content-stack">
    {canPost&&<div className="action-strip"><div><strong>Share an opportunity</strong><p>Help students discover internships, jobs and projects.</p></div><button className="primary-btn" onClick={()=>setShowForm(v=>!v)}><Plus size={16}/>{showForm?'Close form':'Post opportunity'}</button></div>}
    {showForm&&<form className="panel form-panel" onSubmit={submit}><div className="panel-heading"><div><span className="eyebrow">CAREER OPPORTUNITY</span><h3>Create a listing</h3></div></div><div className="form-grid"><Field label="Opportunity title" value={form.title} onChange={v=>set('title',v)} required/><Field label="Company" value={form.company} onChange={v=>set('company',v)} required/><Field label="Type" value={form.type} onChange={v=>set('type',v)} options={['internship','job','project'].map(v=>({value:v,label:pretty(v)}))}/><Field label="Location" value={form.location} onChange={v=>set('location',v)}/><Field label="Application deadline" type="date" value={form.apply_by} onChange={v=>set('apply_by',v)}/><Field label="Application URL" type="url" value={form.application_url} onChange={v=>set('application_url',v)}/><div className="span-two"><Field label="Description" rows={3} value={form.description} onChange={v=>set('description',v)} required/></div></div><button className="primary-btn">Publish opportunity <ArrowRight size={15}/></button></form>}
    {items.length?<div className="opportunity-grid">{items.map(item=><article className="opportunity-card" key={item.id}><div className="opportunity-top"><span className="opportunity-kind">{pretty(item.type)}</span><span className="poster-kind">{pretty(item.poster_role||'alumni')}</span></div><div className="opportunity-company"><span className="company-icon"><Building2 size={18}/></span><div><strong>{item.company}</strong><small>{item.location||'Location not specified'}</small></div></div><h3>{item.title}</h3><p>{item.description}</p><div className="opportunity-meta"><span><CalendarDays size={14}/> {item.apply_by?'Apply by '+dateText(item.apply_by):'Open until filled'}</span><span>Shared by {item.posted_by||'Community'}</span></div>
      {role==='student'&&<button className="primary-btn full" onClick={()=>run('/opportunities/'+item.id+'/apply','POST',{})}>Apply now <ArrowRight size={15}/></button>}
      {canPost&&<small className="owner-note">Applicants for your listings appear in the Applicants section.</small>}</article>)}</div>:<Empty title="No opportunities available" detail="New internships, jobs and projects will appear here when shared by alumni or the institution."/>}
  </div>;
}
function MyApplications({items}) {
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">APPLICATION TRACKER</span><h3>Your submitted applications</h3></div><span className="count-chip">{items.length} total</span></div>{items.length?<div className="table-wrap"><table><thead><tr><th>Opportunity</th><th>Company</th><th>Applied on</th><th>Status</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.title}</strong><small>{item.location}</small></td><td>{item.company}</td><td>{dateText(item.created_at)}</td><td><span className={'status-pill '+item.status}>{pretty(item.status)}</span></td></tr>)}</tbody></table></div>:<Empty title="No applications yet" detail="Explore opportunities and apply. Your application history will appear here."/ >}</section>;
}
function Applicants({items,run}) {
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">RECRUITMENT</span><h3>Student applications</h3><p>Review applicants for opportunities posted by your account.</p></div><span className="count-chip">{items.length} applicants</span></div>{items.length?<div className="table-wrap"><table><thead><tr><th>Student</th><th>Opportunity</th><th>Education</th><th>Applied</th><th>Status</th><th>Update</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.student_name}</strong><small>{item.student_email}</small></td><td>{item.opportunity_title}<small>{item.company}</small></td><td>{item.degree||'—'}<small>{item.department||''} {item.current_year||''}</small></td><td>{dateText(item.created_at)}</td><td><span className={'status-pill '+item.status}>{pretty(item.status)}</span></td><td><select value={item.status} onChange={e=>run('/applications/'+item.id+'/status','PATCH',{status:e.target.value})}>{['submitted','reviewing','shortlisted','rejected','hired'].map(v=><option key={v} value={v}>{pretty(v)}</option>)}</select>{item.resume_url&&<a className="profile-url" href={item.resume_url} target="_blank" rel="noreferrer">Resume <ArrowRight size={12}/></a>}</td></tr>)}</tbody></table></div>:<Empty title="No applicants yet" detail="Applications to your opportunities will appear here with student details and status controls."/>}</section>;
}
function Events({items,role,form,setForm,run}) {
  const [showForm,setShowForm]=useState(false), canCreate=['admin','alumni'].includes(role);
  const set=(key,value)=>setForm(old=>({...old,[key]:value}));
  const submit=async e=>{e.preventDefault();const ok=await run('/events','POST',form);if(ok){setShowForm(false);setForm({title:'',description:'',venue:'Campus',starts_at:''});}};
  return <div className="content-stack">
    {canCreate&&<div className="action-strip"><div><strong>Bring the community together</strong><p>Create a reunion, career talk, workshop or networking event.</p></div><button className="primary-btn" onClick={()=>setShowForm(v=>!v)}><Plus size={16}/>{showForm?'Close form':'Create event'}</button></div>}
    {showForm&&<form className="panel form-panel" onSubmit={submit}><div className="panel-heading"><div><span className="eyebrow">COMMUNITY CALENDAR</span><h3>Schedule an event</h3></div></div><div className="form-grid"><Field label="Event title" value={form.title} onChange={v=>set('title',v)} required/><Field label="Venue or meeting link" value={form.venue} onChange={v=>set('venue',v)}/><Field label="Date and time" type="datetime-local" value={form.starts_at} onChange={v=>set('starts_at',v)} required/><div className="span-two"><Field label="Description" rows={3} value={form.description} onChange={v=>set('description',v)}/></div></div><button className="primary-btn">Publish event <ArrowRight size={15}/></button></form>}
    {items.length?<div className="event-grid">{items.map(item=><article className="event-card" key={item.id}><div className="event-date"><b>{new Date(item.starts_at).getDate()}</b><span>{new Date(item.starts_at).toLocaleString('en',{month:'short'})}</span></div><div className="event-copy"><span className="eyebrow">COMMUNITY EVENT</span><h3>{item.title}</h3><p>{item.description}</p><div className="event-detail"><span><Building2 size={14}/> {item.venue}</span><span><Users size={14}/> {item.attendee_count||0} attending</span><span><CalendarDays size={14}/> {dateTimeText(item.starts_at)}</span></div><small>Organised by {item.created_by_name}</small></div><div className="event-join">{item.registered?<span className="registered"><Check size={15}/> Registered</span>:['student','alumni'].includes(role)?<button className="primary-btn small" onClick={()=>run('/events/'+item.id+'/register','POST',{})}>Register <ArrowRight size={14}/></button>:<span className="muted">View event</span>}</div></article>)}</div>:<Empty title="No events scheduled" detail="Community events will appear here once created by alumni or administrators."/>}
  </div>;
}
function CareerHistory({items,form,setForm,run}) {
  const set=(key,value)=>setForm(old=>({...old,[key]:value}));
  const submit=async e=>{e.preventDefault();const ok=await run('/career-history','POST',form);if(ok)setForm({company:'',job_title:'',employment_type:'Full-time',location:'',start_date:'',end_date:'',is_current:false,description:''});};
  return <div className="content-stack"><form className="panel form-panel" onSubmit={submit}><div className="panel-heading"><div><span className="eyebrow">CAREER JOURNEY</span><h3>Add a role or career update</h3></div></div><div className="form-grid"><Field label="Company" value={form.company} onChange={v=>set('company',v)} required/><Field label="Job title" value={form.job_title} onChange={v=>set('job_title',v)} required/><Field label="Employment type" value={form.employment_type} onChange={v=>set('employment_type',v)} options={['Full-time','Part-time','Internship','Freelance','Self-employed'].map(v=>({value:v,label:v}))}/><Field label="Location" value={form.location} onChange={v=>set('location',v)}/><Field label="Start date" type="date" value={form.start_date} onChange={v=>set('start_date',v)}/>{!form.is_current&&<Field label="End date" type="date" value={form.end_date} onChange={v=>set('end_date',v)}/>}<label className="check-field"><input type="checkbox" checked={form.is_current} onChange={e=>set('is_current',e.target.checked)}/> I currently work here</label><div className="span-two"><Field label="Description" rows={2} value={form.description} onChange={v=>set('description',v)}/></div></div><button className="primary-btn">Save career update <Plus size={15}/></button></form>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">PROFESSIONAL HISTORY</span><h3>Your career timeline</h3></div></div>{items.length?<div className="timeline">{items.map(item=><div className="timeline-item" key={item.id}><span className="timeline-dot"/><div><strong>{item.job_title}</strong><p>{item.company} · {item.location}</p><small>{dateText(item.start_date)} — {item.is_current?'Present':dateText(item.end_date)}</small><p>{item.description}</p><button className="text-link danger-link" onClick={()=>run('/career-history/'+item.id,'DELETE')}>Remove</button></div></div>)}</div>:<Empty title="No career entries yet" detail="Add your current role and previous professional experiences here."/>}</section></div>;
}
function DonationSupport({form,setForm,run}) {
  const set=(key,value)=>setForm(old=>({...old,[key]:value}));
  return <section className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">SUPPORT YOUR INSTITUTION</span><h3>Record a pledge of support</h3><p>This records an expression of interest for institutional follow-up. No payment is collected in this application.</p></div></div><form className="form-stack narrow-form" onSubmit={async e=>{e.preventDefault();const ok=await run('/donation-pledges','POST',form);if(ok)setForm({amount:'',purpose:'',note:''});}}><Field label="Pledge amount (₹)" type="number" value={form.amount} onChange={v=>set('amount',v)} required placeholder="Enter amount"/><Field label="Purpose" value={form.purpose} onChange={v=>set('purpose',v)} required placeholder="Scholarships, labs, student activities…"/><Field label="Additional note" rows={3} value={form.note} onChange={v=>set('note',v)}/><button className="primary-btn">Submit pledge interest <HeartHandshake size={16}/></button></form></section>;
}
function UserManagement({items,run}) {
  const pending=items.filter(x=>x.status==='pending');
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ACCESS AND VERIFICATION</span><h3>Community accounts</h3><p>Approve alumni registrations and manage community access.</p></div><span className="count-chip">{pending.length} pending</span></div>{items.length?<div className="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Registered</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.name}</strong><small>{item.email}</small>{item.department&&<small>{item.department} {item.graduation_year?'· '+item.graduation_year:''}</small>}</td><td>{pretty(item.role)}</td><td>{dateText(item.created_at)}</td><td><span className={'status-pill '+item.status}>{pretty(item.status)}</span></td><td><div className="table-actions">{item.role==='alumni'&&item.status==='pending'?<><button className="primary-btn tiny" onClick={()=>run('/admin/users/'+item.id+'/verification','PATCH',{decision:'approve'})}>Approve</button><button className="outline-btn tiny" onClick={()=>run('/admin/users/'+item.id+'/verification','PATCH',{decision:'reject'})}>Reject</button></>:item.role!=='admin'&&<button className="outline-btn tiny" onClick={()=>run('/admin/users/'+item.id+'/status','PATCH',{status:item.status==='active'?'suspended':'active'})}>{item.status==='active'?'Suspend':'Reactivate'}</button>}</div></td></tr>)}</tbody></table></div>:<Empty title="No accounts found" detail="Registered community accounts will appear here."/>}</section>;
}
function DonationTracking({items,run}) {
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ALUMNI GIVING</span><h3>Pledge interests</h3><p>Track alumni pledge records and institutional follow-up status.</p></div></div>{items.length?<div className="table-wrap"><table><thead><tr><th>Alumnus</th><th>Amount</th><th>Purpose</th><th>Date</th><th>Status</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.alumni_name}</strong><small>{item.email}</small></td><td>₹{Number(item.amount).toLocaleString('en-IN')}</td><td>{item.purpose}<small>{item.note}</small></td><td>{dateText(item.created_at)}</td><td><select value={item.status} onChange={e=>run('/donation-pledges/'+item.id,'PATCH',{status:e.target.value})}>{['interested','contacted','fulfilled','withdrawn'].map(v=><option key={v}>{v}</option>)}</select></td></tr>)}</tbody></table></div>:<Empty title="No pledge records yet" detail="Alumni pledge interests will appear here."/>}</section>;
}
function Reports({data,download}) {
  if(!data)return <Empty title="Reports are unavailable" detail="Check the database connection and refresh this page."/>;
  return <div className="content-stack"><div className="stats-grid"><Stat label="Career history entries" value={data.careerEntries} icon={Activity}/><Stat label="Event registrations" value={data.eventRegistrations} icon={CalendarDays} tone="orange"/><Stat label="Pledge categories" value={data.pledgesByStatus?.length||0} icon={HeartHandshake} tone="green"/></div><div className="report-grid">
    <ReportCard title="Users by role" rows={data.usersByRole||[]} label="role"/>
    <ReportCard title="Mentorship requests" rows={data.mentorshipByStatus||[]} label="status"/>
    <ReportCard title="Opportunities by type" rows={data.opportunitiesByType||[]} label="type"/>
    <ReportCard title="Donation pledge status" rows={data.pledgesByStatus||[]} label="status" amount/>
  </div><div className="action-strip"><div><strong>Alumni directory export</strong><p>Download alumni contact and career details for institutional records.</p></div><button className="primary-btn" onClick={download}><ArrowDownToLine size={16}/> Export CSV</button></div></div>;
}
function ReportCard({title,rows,label,amount}) {
  return <section className="panel report-card"><h3>{title}</h3>{rows.length?rows.map((row,i)=><div className="report-line" key={i}><span>{pretty(row[label])}</span><strong>{row.count}{amount&&row.amount!==undefined?' · ₹'+Number(row.amount).toLocaleString('en-IN'):''}</strong></div>):<p className="muted">No records yet.</p>}</section>;
}
function Announcements({items,role,form,setForm,run}) {
  const canPost=role==='admin',set=(key,value)=>setForm(old=>({...old,[key]:value}));
  return <div className="content-stack">{canPost&&<form className="panel form-panel" onSubmit={async e=>{e.preventDefault();const ok=await run('/announcements','POST',form);if(ok)setForm({title:'',body:'',audience:'all'});}}><div className="panel-heading"><div><span className="eyebrow">INSTITUTIONAL COMMUNICATION</span><h3>Publish an announcement</h3></div></div><div className="form-grid"><Field label="Announcement title" value={form.title} onChange={v=>set('title',v)} required/><Field label="Audience" value={form.audience} onChange={v=>set('audience',v)} options={['all','students','alumni'].map(v=>({value:v,label:pretty(v)}))}/><div className="span-two"><Field label="Message" rows={3} value={form.body} onChange={v=>set('body',v)} required/></div></div><button className="primary-btn">Publish announcement <Megaphone size={15}/></button></form>}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">COMMUNITY BULLETIN</span><h3>Recent announcements</h3></div></div>{items.length?items.map(item=><article className="announcement-item" key={item.id}><div className="announcement-symbol"><Megaphone size={18}/></div><div><div className="announcement-meta"><strong>{item.title}</strong><span>{pretty(item.audience)}</span></div><p>{item.body}</p><small>{item.author||'Institution'} · {dateTimeText(item.created_at)}</small></div></article>):<Empty title="No announcements" detail="Official institution updates will be published here."/>}</section>
  </div>;
}
function Notifications({items,run}) {
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">YOUR INBOX</span><h3>Recent activity</h3></div><span className="count-chip">{items.filter(x=>!x.is_read).length} unread</span></div>{items.length?items.map(item=><article className={'notification-row '+(!item.is_read?'unread':'')} key={item.id}><div className="notification-icon"><Bell size={17}/></div><div className="notification-content"><strong>{item.title}</strong><p>{item.body}</p><small>{dateTimeText(item.created_at)}</small></div>{!item.is_read&&<button className="outline-btn tiny" onClick={()=>run('/notifications/'+item.id+'/read','PATCH',{})}>Mark read</button>}</article>):<Empty title="You're all caught up" detail="New mentorship requests, applications and community updates will appear here."/>}</section>;
}
function Profile({role,profile,setProfile,run}) {
  const set=(key,value)=>setProfile(old=>({...old,[key]:value}));
  const listString=(key)=>Array.isArray(profile[key])?profile[key].join(', '):(profile[key]||'');
  const save=async e=>{e.preventDefault();const payload={...profile};['skills','interests','career_interests'].forEach(k=>{if(typeof payload[k]==='string')payload[k]=payload[k].split(',').map(v=>v.trim()).filter(Boolean);});await run('/profile','PUT',payload);};
  return <form className="panel form-panel" onSubmit={save}><div className="profile-hero"><Avatar name={profile.name||''} size="profile"/><div><span className="eyebrow">{pretty(role)} ACCOUNT</span><h2>{profile.name}</h2><p>{profile.email}</p><span className={'status-pill '+profile.status}>{pretty(profile.status)}</span></div></div><div className="panel-heading"><div><h3>Personal and professional details</h3><p>Keep your contact, academic and career information current.</p></div></div>
    <div className="form-grid"><Field label="Full name" value={profile.name||''} onChange={v=>set('name',v)} required/>
      {role==='student'&&<><Field label="Student ID" value={profile.student_id||''} onChange={v=>set('student_id',v)}/><Field label="Department" value={profile.department||''} onChange={v=>set('department',v)}/><Field label="Degree" value={profile.degree||''} onChange={v=>set('degree',v)}/><Field label="Current year" value={profile.current_year||''} onChange={v=>set('current_year',v)}/><Field label="Expected graduation year" type="number" value={profile.graduation_year||''} onChange={v=>set('graduation_year',v)}/><Field label="Skills (comma separated)" value={listString('skills')} onChange={v=>set('skills',v)}/><div className="span-two"><Field label="Interests (comma separated)" value={listString('interests')} onChange={v=>set('interests',v)}/></div><div className="span-two"><Field label="Career interests (comma separated)" value={listString('career_interests')} onChange={v=>set('career_interests',v)}/></div><div className="span-two"><Field label="Short bio" rows={3} value={profile.bio||''} onChange={v=>set('bio',v)}/></div></>}
      {role==='alumni'&&<><Field label="Graduation year" type="number" value={profile.graduation_year||''} onChange={v=>set('graduation_year',v)}/><Field label="Department" value={profile.department||''} onChange={v=>set('department',v)}/><Field label="Degree" value={profile.degree||''} onChange={v=>set('degree',v)}/><Field label="Current company" value={profile.company||''} onChange={v=>set('company',v)}/><Field label="Job title" value={profile.job_title||''} onChange={v=>set('job_title',v)}/><Field label="Location" value={profile.location||''} onChange={v=>set('location',v)}/><Field label="Skills (comma separated)" value={listString('skills')} onChange={v=>set('skills',v)}/><div className="span-two"><Field label="LinkedIn URL" type="url" value={profile.linkedin_url||''} onChange={v=>set('linkedin_url',v)}/><Field label="Professional summary" rows={3} value={profile.bio||''} onChange={v=>set('bio',v)}/></div><label className="check-field"><input type="checkbox" checked={profile.is_public!==false} onChange={e=>set('is_public',e.target.checked)}/> Show my profile in the alumni directory</label></>}
      <label className="static-field"><span>Email address</span><strong>{profile.email}</strong><small>Contact an administrator to change your registered email.</small></label>
    </div><div className="form-actions"><button className="primary-btn">Save profile changes <Check size={15}/></button></div>
  </form>;
}
