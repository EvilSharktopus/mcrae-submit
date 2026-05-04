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

async function fixNames() {
  console.log('Fetching submissions...');
  const sSnap = await getDocs(collection(db, 'submissions'));
  const updates = [];
  
  sSnap.docs.forEach(d => {
    const s = d.data();
    let newName = null;
    if (s.studentName === 'Mason' || s.studentName === 'mason') newName = 'Mason Barrie';
    else if (s.studentName === 'Milan' || s.studentName === 'milan') newName = 'Milan Chan';
    else if (s.studentName === 'Ruby' || s.studentName === 'ruby') newName = 'Ruby Rayner';
    
    if (newName) {
      console.log(`Fixing ${s.studentName} -> ${newName} (doc: ${d.id})`);
      updates.push(updateDoc(doc(db, 'submissions', d.id), { studentName: newName }));
    }
  });

  if (updates.length > 0) {
    console.log(`Applying ${updates.length} updates...`);
    await Promise.all(updates);
    console.log('Names successfully updated in Firestore!');
  } else {
    console.log('No names needed fixing.');
  }
}

fixNames().catch(console.error).finally(() => process.exit(0));
