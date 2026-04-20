// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
} from 'firebase/auth';

const TEACHER_EMAIL = import.meta.env.VITE_TEACHER_EMAIL;
const ALLOWED_DOMAIN = 'rvschools.ab.ca';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsTeacher(u?.email === TEACHER_EMAIL);
    });
  }, []);

  const signIn = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const signUp = async (email, password, displayName) => {
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      throw new Error(`Please use your @${ALLOWED_DOMAIN} school email.`);
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(cred.user, { displayName });
    return cred;
  };

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const signOutUser = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, isTeacher, signIn, signUp, resetPassword, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
