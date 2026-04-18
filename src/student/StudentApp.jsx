// src/student/StudentApp.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AssignmentList from './AssignmentList';
import SubmissionPage from './SubmissionPage';
import '../styles/globals.css';

export default function StudentApp() {
  const { user, signOut } = useAuth();
  return (
    <>
      <nav className="app-nav">
        <span className="app-nav__brand">McRae Submit</span>
        <div className="app-nav__right">
          <span className="app-nav__user">{user.displayName}</span>
          <button className="app-nav__signout" onClick={signOut}>Sign out</button>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<AssignmentList />} />
        <Route path="/submit/:assignmentId" element={<SubmissionPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}
