// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'firebase/auth';

const TEACHER_EMAIL = import.meta.env.VITE_TEACHER_EMAIL;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    // Handle redirect result after Google sign-in
    getRedirectResult(auth).catch((err) => {
      console.error('Redirect sign-in error:', err);
    });

    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsTeacher(u?.email === TEACHER_EMAIL);
    });
  }, []);

  const signIn = () => {
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider);
  };

  const signOutUser = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, isTeacher, signIn, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
