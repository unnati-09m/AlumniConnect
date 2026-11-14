import React, { useEffect, useState } from 'react';
import { request } from '../App.jsx';
import { Building2, CalendarDays, GraduationCap, Search, ShieldCheck } from 'lucide-react';

export default function AlumniDirectory({ token, onSelectAlumni }) {
  const [alumni, setAlumni] = useState([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    request('/alumni', token)
      .then(data => {
        setAlumni(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load alumni directory:', err);
        setLoading(false);
      });
  }, [token]);

  const departments = [...new Set(alumni.map(p => p.department).filter(Boolean))];
  const filtered = alumni.filter(person => {
    const matchesDept = department === 'all' || person.department === department;
    const matchesSearch = !search || [person.name, person.company, person.department, person.job_title]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesDept && matchesSearch;
  });

  return (
    <div className="panel">
      <div className="directory-toolbar">
        <div>
          <h3>{filtered.length} verified alumni</h3>
          <p>Discover alumni, explore career paths, and build professional connections.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by name, company, role…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="all">All departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      {loading ? (
        <p style={{ padding: '20px', color: '#888' }}>Loading verified alumni…</p>
      ) : filtered.length ? (
        <div className="people-grid">
          {filtered.map(person => (
            <article className="person-card" key={person.id} onClick={() => onSelectAlumni?.(person)}>
              <div className="person-card-top">
                <div className="avatar large">{person.name?.slice(0, 2).toUpperCase()}</div>
                <span className="verified-badge"><ShieldCheck size={13} /> Verified</span>
              </div>
              <h3>{person.name}</h3>
              <p className="person-role">{person.job_title || 'Alumni member'} {person.company ? 'at ' + person.company : ''}</p>
              <div className="person-meta">
                <span><GraduationCap size={14} />{person.department}</span>
                <span><CalendarDays size={14} />Class of {person.graduation_year}</span>
                <span><Building2 size={14} />{person.location || 'Location not shared'}</span>
              </div>
              <p className="person-bio">{person.bio || 'Open to connecting with the community.'}</p>
              {person.skills?.length > 0 && (
                <div className="skill-list">
                  {person.skills.slice(0, 5).map(skill => <span key={skill}>{skill}</span>)}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No matching alumni found</strong>
          <p>Try adjusting your search or department filter.</p>
        </div>
      )}
    </div>
  );
}
