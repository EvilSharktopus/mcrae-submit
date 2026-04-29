import { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useJigsawAssignment } from './useJigsawAssignment';
import JigsawLanding from './JigsawLanding';
import JigsawSubtopic from './JigsawSubtopic';
import JigsawResearch from './JigsawResearch';
import '../../styles/jigsaw.css';

export default function JigsawApp() {
  const { user } = useAuth();
  const { loading, activityId, assignment, setAssignment } = useJigsawAssignment(user);
  const [selectedTopic, setSelectedTopic] = useState(null);

  if (loading) {
    return <div className="loading-screen"><span className="spinner" /></div>;
  }

  if (!activityId) {
    return (
      <div className="jigsaw-status-screen">
        <div className="jigsaw-status-screen__icon">🔒</div>
        <div className="jigsaw-status-screen__title">No Active Jigsaw</div>
        <div className="jigsaw-status-screen__sub">Mr. McRae hasn't started a jigsaw activity yet.</div>
      </div>
    );
  }

  if (assignment) {
    return (
      <JigsawResearch 
        activityId={activityId} 
        assignment={assignment} 
        setAssignment={setAssignment} 
      />
    );
  }

  if (selectedTopic) {
    return (
      <JigsawSubtopic 
        activityId={activityId} 
        topic={selectedTopic} 
        onBack={() => setSelectedTopic(null)} 
        onClaimed={(sub) => setAssignment(sub)} 
      />
    );
  }

  return (
    <JigsawLanding 
      activityId={activityId} 
      onTopicSelect={(topic) => setSelectedTopic(topic)} 
    />
  );
}
