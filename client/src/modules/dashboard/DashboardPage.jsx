// The dispatcher's main screen: who needs attention first, and why.
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSortedCases, useLive } from '../../LiveState.jsx';
import ControlBar from './ControlBar.jsx';
import PriorityQueue from './PriorityQueue.jsx';
import CaseDetail from './CaseDetail.jsx';

export default function DashboardPage() {
  const sorted = useSortedCases();
  const { cases } = useLive();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('person');

  useEffect(() => {
    if ((!selectedId || !cases[selectedId]) && sorted.length) {
      setParams({ person: sorted[0].personId }, { replace: true });
    }
  }, [selectedId, cases, sorted, setParams]);

  const select = (id) => setParams({ person: id });

  return (
    <main className="dashboard">
      <ControlBar />
      <div className="dash-body">
        <PriorityQueue cases={sorted} selectedId={selectedId} onSelect={select} />
        {selectedId && cases[selectedId] ? (
          <CaseDetail key={selectedId} c={cases[selectedId]} />
        ) : (
          <div className="panel detail empty-detail muted">Select a person</div>
        )}
      </div>
    </main>
  );
}
