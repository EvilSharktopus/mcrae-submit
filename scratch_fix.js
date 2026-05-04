import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { existsSync } from 'fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
else if (existsSync('.env')) process.loadEnvFile('.env');

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspectStudent() {
  console.log('Fetching submissions for Kinnley...');
  const sSnap = await getDocs(collection(db, 'submissions'));
  
  const subs = [];
  sSnap.docs.forEach(d => {
    const s = d.data();
    if (s.studentEmail === 'kinnleypevoy@rvschools.ab.ca') {
      subs.push({
        id: d.id,
        assignmentId: s.assignmentId,
        studentName: s.studentName,
        submitted: s.submitted,
        wordCount: s.wordCount,
        hasResponse: !!s.response,
        responseLength: s.response ? s.response.length : 0,
        plainResponseLen: s.plainResponse ? s.plainResponse.length : 0,
        lastSaved: s.lastSaved ? s.lastSaved.toDate() : null,
        submittedAt: s.submittedAt ? s.submittedAt.toDate() : null
      });
    }
  });

  console.log(`Found ${subs.length} submissions for Kinnley:`);
  console.dir(subs, { depth: null, colors: true });
}

inspectStudent().catch(console.error).finally(() => process.exit(0));
