import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { exportCSV } from '../utils/exportUtils';
import '../styles/dashboard.css';

export default function Grades() {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [aSnap, sSnap] = await Promise.all([
          getDocs(collection(db, 'assignments')),
          getDocs(collection(db, 'submissions')),
        ]);
        const asns = aSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => !a.archived);
        setAssignments(asns);
        setSubmissions(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        // TEMPORARY FIX
        const updates = [];
        sSnap.docs.forEach(d => {
          const s = d.data();
          let newName = null;
          if (s.studentName === 'Mason' || s.studentName === 'mason') newName = 'Mason Barrie';
          else if (s.studentName === 'Milan' || s.studentName === 'milan') newName = 'Milan Chan';
          else if (s.studentName === 'Ruby' || s.studentName === 'ruby') newName = 'Ruby Rayner';
          
          if (newName) {
            updates.push(updateDoc(doc(db, 'submissions', d.id), { studentName: newName }));
          }
        });
        if (updates.length > 0) {
          console.log('Fixing names for', updates.length, 'docs...');
          await Promise.all(updates);
          alert('Names successfully updated! You can now close this alert and I will remove the script.');
        }

        // Auto-select first available group
        const groupMap = {};
        asns.forEach(a => {
          const key = `${a.course}${a.stream ? ' ' + a.stream : ''}`;
          groupMap[key] = true;
        });
        const groupKeys = Object.keys(groupMap).sort();
        if (groupKeys.length > 0) {
          setSelectedGroup(groupKeys[0]);
        }
      } catch (err) {
        console.error('Error loading grades data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const groups = useMemo(() => {
    const map = {};
    assignments.forEach(a => {
      const key = `${a.course}${a.stream ? ' ' + a.stream : ''}`;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    // Sort assignments alphabetically within group
    Object.values(map).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [assignments]);

  const groupKeys = Object.keys(groups).sort();

  const currentAssignments = groups[selectedGroup] || [];

  const students = useMemo(() => {
    if (!selectedGroup || currentAssignments.length === 0) return [];
    
    const asnIds = new Set(currentAssignments.map(a => a.id));
    const relevantSubs = submissions.filter(s => asnIds.has(s.assignmentId));

    const studentMap = {}; // email -> { name, email, grades: { asnId: mark } }

    relevantSubs.forEach(s => {
      if (!studentMap[s.studentEmail]) {
        studentMap[s.studentEmail] = {
          name: s.studentName,
          email: s.studentEmail,
          grades: {}
        };
      }
      // If there are multiple submissions for the same assignment, keep the latest or the one with a mark
      if (s.mark != null || studentMap[s.studentEmail].grades[s.assignmentId] == null) {
        studentMap[s.studentEmail].grades[s.assignmentId] = s.mark;
      }
      
      // Update name to the most recent known name in case it changed
      if (s.studentName && s.studentName !== studentMap[s.studentEmail].name) {
          studentMap[s.studentEmail].name = s.studentName;
      }
    });

    const getLastName = (fullName) => {
      if (!fullName) return '';
      const parts = fullName.trim().split(' ');
      return parts[parts.length - 1].toLowerCase();
    };

    return Object.values(studentMap).sort((a, b) => {
      return getLastName(a.name).localeCompare(getLastName(b.name));
    });
  }, [submissions, currentAssignments, selectedGroup]);

  const handleExport = () => {
    if (!selectedGroup || currentAssignments.length === 0) return;
    
    const headers = ['Student Name', 'Email', ...currentAssignments.map(a => a.name)];
    
    const rows = students.map(s => {
      const row = [s.name, s.email];
      currentAssignments.forEach(a => {
        row.push(s.grades[a.id] ?? '');
      });
      return row;
    });

    exportCSV(`${selectedGroup.replace(/\s+/g, '_')}_Gradebook.csv`, headers, rows);
  };

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  return (
    <div className="page-wide" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0, flex: 1 }}>Gradebook</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>Course:</label>
          <select 
            value={selectedGroup} 
            onChange={(e) => setSelectedGroup(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', fontSize: 14 }}
          >
            {groupKeys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <button
          className="btn btn--secondary btn--sm"
          onClick={handleExport}
          disabled={students.length === 0}
        >
          ↓ Export CSV
        </button>
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
        {students.length === 0 ? (
          <div className="empty">
            <span className="empty__icon">📋</span>
            <p>No students have submitted work for this course yet.</p>
          </div>
        ) : (
          <table className="student-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 150, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>Student</th>
                {currentAssignments.map(a => (
                  <th key={a.id} style={{ minWidth: 100, textAlign: 'center' }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }} title={a.name}>
                      {a.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.email}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1, borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.email}</div>
                  </td>
                  {currentAssignments.map(a => (
                    <td key={a.id} style={{ textAlign: 'center', fontSize: 14, fontWeight: 500 }}>
                      {s.grades[a.id] != null ? s.grades[a.id] : <span style={{ color: 'var(--border)' }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
