import { useOutletContext } from 'react-router-dom';
import Empty, { Loading } from '../components/Empty.jsx';
import useCourse from './useCourse.js';
import { useViewers } from './shared.jsx';
import Desk from './Desk.jsx';
import Stack from './Stack.jsx';
import Cards from './Cards.jsx';
import Focus from './Focus.jsx';

// The Learning lab: four structures over one data layer, picked by the
// switcher in the page header. Here so they can be compared side by side
// before one is chosen; the others are then deleted, not kept behind flags.
export const LAYOUTS = [
  { key: '1', name: 'Desk', hint: 'one week, three columns' },
  { key: '2', name: 'Stack', hint: 'one long page, lesson opens inline' },
  { key: '3', name: 'Cards', hint: 'one card per class' },
  { key: '4', name: 'Focus', hint: 'one lesson, drawers for the rest' },
];

export default function Lab({ layout }) {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  const course = useCourse({ isStudent });
  const viewers = useViewers();
  if (course.loading) return <div className="panel"><Loading rows={5} /></div>;
  if (!course.program) return <div className="panel"><Empty icon="programs" title="No programme yet." hint="You’ll see your course here once you’re enrolled in a batch." /></div>;
  if (course.flat.length === 0) return <div className="panel"><Empty icon="learning" title="No lessons published yet." hint="Your mentor is still building this programme out. Check back soon." /></div>;
  const View = { 1: Desk, 2: Stack, 3: Cards, 4: Focus }[layout] || Desk;
  return (
    <div className="lab">
      {course.programs.length > 1 && (
        <select className="lab-pick" aria-label="Programme" value={course.program._id} onChange={(e) => course.switchProgram(e.target.value)}>
          {course.programs.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
        </select>
      )}
      <View key={layout} course={course} viewers={viewers} isStudent={isStudent} />
      {viewers.nodes}
    </div>
  );
}
