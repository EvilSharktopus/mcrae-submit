// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './auth/LoginPage';
import StudentApp from './student/StudentApp';
import TeacherApp from './teacher/TeacherApp';
import ResetPassword from './auth/ResetPassword';

function AppRoutes() {
  const { user, isTeacher } = useAuth();

  // Still loading auth state
  if (user === undefined) {
    return <div className="loading-screen"><span className="spinner" /></div>;
  }

  // Not signed in
  if (!user) return <LoginPage />;

  // Signed in — route by role
  const isStudentView = localStorage.getItem('studentView') === 'true';
  if (isTeacher && !isStudentView) return <TeacherApp />;
  return <StudentApp />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public: custom password-reset handler (must be outside auth guard so
              the school email scanner can fetch the page without consuming the oobCode) */}
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Everything else goes through the auth guard */}
          <Route path="*" element={<AppRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
