import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

export function useJigsawAssignment(user) {
  const [loading, setLoading] = useState(true);
  const [activityId, setActivityId] = useState(null);
  const [assignment, setAssignment] = useState(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        let snap = await getDocs(query(collection(db, 'jigsawActivities'), where('isActive', '==', true), limit(1)));
        if (snap.empty) {
          setLoading(false);
          return;
        }
        let actId = snap.docs[0].id;
        setActivityId(actId);
        let subSnap = await getDocs(query(collection(db, `jigsawActivities/${actId}/submissions`), where('userId', '==', user.uid), limit(1)));
        if (subSnap.empty) {
          setAssignment(null);
        } else {
          setAssignment({ id: subSnap.docs[0].id, ...subSnap.docs[0].data() });
        }
      } catch (err) {
        console.error('useJigsawAssignment error:', err);
        setAssignment(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.uid]);

  return { loading, activityId, assignment, setAssignment };
}
