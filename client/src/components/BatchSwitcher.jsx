import { useEffect, useState } from 'react';
import { api } from '../api.js';

// The student's batch, beside the programme's name in Learning, once they are
// in more than one. Which batch is in view is the server's answer
// (activeBatchId), so a page that loads before this does agrees with it. See
// server/utils/studentBatches.js for what follows the choice and what does not.
export default function BatchSwitcher({ onSwitch }) {
  const [batches, setBatches] = useState([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    api('/batches')
      .then((d) => { setBatches(d.batches || []); setActive(String(d.activeBatchId || '')); })
      .catch(() => {});
  }, []);

  if (batches.length < 2) return null;

  const choose = (id) => {
    const from = batches.find((b) => String(b.id) === active);
    const to = batches.find((b) => String(b.id) === id);
    setActive(id);
    onSwitch(id, String(from?.programId) === String(to?.programId));
  };

  // A phone cuts the name short, and in one programme the end of it is the only
  // part that differs: "AI Generalist · Sept 2026" against "… · Nov 2026".
  const oneProgramme = new Set(batches.map((b) => String(b.programId))).size === 1;
  const label = (b) => (oneProgramme ? b.name.split(' · ').pop() : b.name);

  return (
    <select className="batch-switch" aria-label="Batch" value={active} onChange={(e) => choose(e.target.value)}>
      {batches.map((b) => <option key={b.id} value={String(b.id)}>{label(b)}</option>)}
    </select>
  );
}
