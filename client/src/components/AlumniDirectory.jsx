import React, { useEffect, useState } from 'react';
import { request } from '../App.jsx'; // assuming request helper exported
export default function AlumniDirectory({ token }) {
  const [alumni, setAlumni] = useState([]);
  useEffect(() => {
    request('/alumni', token).then(setAlumni).catch(console.error);
  }, [token]);
  return (<div><h2>Alumni Directory</h2>{alumni.map(a => <div key={a.id}>{a.name} – {a.company}</div>)}</div>);
}
