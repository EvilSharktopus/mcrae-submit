// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './auth/LoginPage';
import StudentApp from './student/StudentApp';
import TeacherApp from './teacher/TeacherApp';

function AppRoutes() {
  const { user, isTeacher } = useAuth();

  // Still loading auth state
  if (user === undefined) {
    return <div className="loading-screen"><span className="spinner" /></div>;
  }

  // Not signed in
  if (!user) return <LoginPage />;

  // Signed in — route by role
  if (isTeacher) return <TeacherApp />;
  return <StudentApp />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
